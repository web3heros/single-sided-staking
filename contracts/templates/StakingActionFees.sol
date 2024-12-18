// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { StakingBase, SafeERC20, IERC20 } from "./base/StakingBase.sol";
import { IStakingActionFees } from "./../interfaces/templates/IStakingActionFees.sol";

contract StakingActionFees is StakingBase, IStakingActionFees {
    using SafeERC20 for IERC20;

    uint16 internal constant BPS = 1e4;

    uint16 public depositFee = 0;
    uint16 public withdrawFee = 0;
    uint16 public restakeFee = 0;

    /// @inheritdoc StakingBase
    function _initialize(address _stakingToken, address _owner, bytes calldata _args) internal virtual override {
        super._initialize(_stakingToken, _owner, _args);
        (uint16 _depositFee, uint16 _withdrawFee, uint16 _restakeFee) = abi.decode(_args, (uint16, uint16, uint16));
        _updateFees(_depositFee, _withdrawFee, _restakeFee);
    }

    ///
    /// Executables
    ///

    function _deposit(
        address _staker,
        uint256 _amount,
        uint256 _minAmount
    ) internal virtual override(StakingBase) returns (uint256 _depositAmount) {
        if (_staker == address(0)) revert StakingActionFees__AddressZero();
        _depositAmount = _transferFrom(stakingToken, _msgSender(), _amount, _minAmount);

        // charge deposit fee
        if (depositFee > 0 && staked > 0) {
            uint256 _fee = (_depositAmount * depositFee) / BPS;
            _depositAmount -= _fee;
            _updateReward(_fee);
        }

        _update(_staker, int256(_depositAmount));
    }

    function _withdraw(address _receiver, uint256 _amount) internal virtual override(StakingBase) returns (uint256 _withdrawAmount) {
        if (_receiver == address(0)) revert StakingActionFees__AddressZero();
        if (_amount == 0) revert StakingActionFees__AmountZero();
        _withdrawAmount = _amount;

        // update stakers stake BEFORE charging fees
        _update(_msgSender(), -int256(_withdrawAmount));

        // charge withdraw fee
        if (withdrawFee > 0 && staked > 0) {
            uint256 _fee = (_withdrawAmount * withdrawFee) / BPS;
            _withdrawAmount -= _fee;
            _updateReward(_fee);
        }

        IERC20(stakingToken).safeTransfer(_receiver, _withdrawAmount);
    }

    function _restake() internal virtual override(StakingBase) returns (uint256 _restakeAmount) {
        _restakeAmount = _update(_msgSender(), 0);
        if (_restakeAmount > 0) {
            stakes[_msgSender()].pending = 0;

            // charge restake fee
            if (restakeFee > 0) {
                uint256 _fee = (_restakeAmount * restakeFee) / BPS;
                _restakeAmount -= _fee;
                _updateReward(_fee);
            }

            _update(_msgSender(), int256(_restakeAmount));
            emit Claim(_msgSender(), _restakeAmount);
            emit Restaked(_msgSender(), _restakeAmount);
        } else revert StakingActionFees__InvalidAmount();
    }

    ///
    /// Management
    ///

    function updateFees(
        uint16 _depositFee,
        uint16 _withdrawFee,
        uint16 _restakeFee,
        address[] calldata _referrals
    ) external payable virtual onlyOwner processValue(_referrals) {
        _updateFees(_depositFee, _withdrawFee, _restakeFee);
    }

    function _updateFees(uint16 _depositFee, uint16 _withdrawFee, uint16 _restakeFee) internal {
        if ((_depositFee | _withdrawFee | _restakeFee) == 0) revert StakingActionFees__ZeroFee();
        if (_depositFee > 1000 || _withdrawFee > 1000 || _restakeFee > 1000) revert StakingActionFees__InvalidFee();
        if (_depositFee != depositFee) depositFee = _depositFee;
        if (_withdrawFee != withdrawFee) withdrawFee = _withdrawFee;
        if (_restakeFee != restakeFee) restakeFee = _restakeFee;
        emit UpdateFees(_depositFee, _withdrawFee, _restakeFee);
    }
}
