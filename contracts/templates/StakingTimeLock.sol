// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { StakingBase, SafeERC20, IERC20 } from "./base/StakingBase.sol";
import { IStakingTimeLock } from "./../interfaces/templates/IStakingTimeLock.sol";

contract StakingTimeLock is StakingBase, IStakingTimeLock {
    using SafeERC20 for IERC20;

    uint64 public lockPeriod;

    mapping(address staker => uint64 unlock) locks;

    function _initialize(address _stakingToken, address _owner, bytes calldata _args) internal virtual override {
        super._initialize(_stakingToken, _owner, _args);
        (rewardToken, lockPeriod) = abi.decode(_args, (address, uint64));
        if (rewardToken == address(0)) revert StakingTimeLock__AddressZero();
        if (lockPeriod == 0) revert StakingTimeLock__AmountZero();
    }

    function _deposit(address _staker, uint256 _amount, uint256 _minAmount) internal virtual override returns (uint256 _depositAmount) {
        _depositAmount = super._deposit(_staker, _amount, _minAmount);
        locks[_staker] = uint64(block.timestamp) + lockPeriod;
    }

    function _withdraw(address _receiver, uint256 _amount) internal virtual override returns (uint256 _withdrawAmount) {
        if (locks[_msgSender()] > block.timestamp) revert StakingTimeLock__Locked();
        _withdrawAmount = super._withdraw(_receiver, _amount);
    }

    function _restake() internal virtual override returns (uint256 _restakeAmount) {
        _restakeAmount = super._restake();
        locks[_msgSender()] = uint64(block.timestamp) + lockPeriod;
    }

    function getLockOf(address _staker) external view returns (uint64 _current, uint64 _release) {
        _current = uint64(block.timestamp);
        _release = locks[_staker];
    }
}
