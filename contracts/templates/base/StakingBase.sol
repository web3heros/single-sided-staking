// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { IStakingBase } from "./../../interfaces/templates/base/IStakingBase.sol";

abstract contract StakingBase is IStakingBase, Ownable2StepUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 internal constant PRECISION = 1e18;

    /// @dev precision scaled dividend
    uint256 internal dividend;

    /// @dev precision scaled remainder
    uint256 internal remainder;

    /// @notice total amount that has been staked
    uint128 public staked;

    /// @notice address of the token a staker has to deposit to perticipate in staking
    address public stakingToken;

    /// @notice address of the token that will get rewarded to the stakers
    address public rewardToken;

    /// @dev staker address to stake data relation
    mapping(address => Stake) internal stakes;

    /// @dev keeps track of all stakers in the protocol
    EnumerableSet.AddressSet internal stakers;

    modifier processValue(address[] calldata _receivers) {
        _processValue(_receivers);
        _;
    }

    constructor() {
        _disableInitializers();
        _pause();
    }

    function initialize(address _stakingToken, address _owner, bytes calldata args) external virtual initializer {
        _initialize(_stakingToken, _owner, args);
    }

    function _initialize(address _stakingToken, address _owner, bytes calldata) internal virtual {
        __Ownable_init(_owner);
        __Pausable_init();
        __Ownable2Step_init();
        __ReentrancyGuard_init();

        // initially paused
        _pause();

        if (_stakingToken == address(0)) revert Staking__AddressZero();

        stakingToken = _stakingToken;
        rewardToken = _stakingToken;
    }

    ///
    /// Executables
    ///
    function enable(bool _enable, address[] calldata _referrals) external payable virtual onlyOwner processValue(_referrals) {
        if (_enable) _unpause();
        else _pause();
    }

    // deposits a stake
    function deposit(
        address _staker,
        uint256 _amount,
        uint256 _minAmount,
        address[] calldata _referrals
    ) external payable virtual whenNotPaused nonReentrant processValue(_referrals) returns (uint256 _depositAmount) {
        _depositAmount = _deposit(_staker, _amount, _minAmount);
    }

    function _deposit(address _staker, uint256 _amount, uint256 _minAmount) internal virtual returns (uint256 _depositAmount) {
        if (_staker == address(0)) revert Staking__AddressZero();
        _depositAmount = _transferFrom(stakingToken, _msgSender(), _amount, _minAmount);
        _update(_staker, int256(_depositAmount));
    }

    // withdraws a stake and sends it to the receiver
    // checks if the sender is the delegator. If it's a delegator, receiver is mandatory
    // if there is no delegator and receiver is address(0) it is sent to sender
    // depending if stake exists
    function withdraw(
        address _receiver,
        uint256 _amount,
        address[] calldata _referrals
    ) external payable virtual nonReentrant processValue(_referrals) returns (uint256 _withdrawAmount) {
        _withdrawAmount = _withdraw(_receiver, _amount);
    }

    function _withdraw(address _receiver, uint256 _amount) internal virtual returns (uint256 _withdrawAmount) {
        if (_receiver == address(0)) revert Staking__AddressZero();
        if (_amount == 0) revert Staking__AmountZero();
        _withdrawAmount = _amount;
        _update(_msgSender(), -int256(_withdrawAmount));
        IERC20(stakingToken).safeTransfer(_receiver, _withdrawAmount);
    }

    function restake(
        address[] calldata _referrals
    ) external payable virtual whenNotPaused nonReentrant processValue(_referrals) returns (uint256 _restakeAmount) {
        _restakeAmount = _restake();
    }

    function _restake() internal virtual returns (uint256 _restakeAmount) {
        _restakeAmount = _update(_msgSender(), 0);
        if (_restakeAmount > 0) {
            stakes[_msgSender()].pending = 0;
            _update(_msgSender(), int256(_restakeAmount));
            emit Claim(_msgSender(), _restakeAmount);
            emit Restaked(_msgSender(), _restakeAmount);
        } else revert Staking__InvalidAmount();
    }

    // // restakes the rewards
    // function restake() external virtual {}

    // claim rewards
    function claimRewards(
        address _receiver,
        address[] calldata _referrals
    ) external payable virtual nonReentrant processValue(_referrals) returns (uint256 _claimAmount) {
        _claimAmount = _claimRewards(_receiver);
    }

    function _claimRewards(address _receiver) internal virtual returns (uint256 _claimAmount) {
        if (_receiver == address(0)) revert Staking__AddressZero();
        Stake storage _stake = stakes[_msgSender()];
        uint256 _pending = _update(_msgSender(), 0);
        if (_pending > 0) {
            _stake.pending = 0;
            IERC20(rewardToken).safeTransfer(_receiver, _pending);
            emit Claim(_msgSender(), _pending);
        }
        _claimAmount = _pending;
    }

    // inject rewards
    function injectRewards(
        uint256 _amount,
        uint256 _minAmount,
        address[] calldata _referrals
    ) external payable virtual whenNotPaused nonReentrant processValue(_referrals) returns (uint256 _injectedAmount) {
        _injectedAmount = _injectRewards(_amount, _minAmount);
    }

    function _injectRewards(uint256 _amount, uint256 _minAmount) internal virtual returns (uint256 _injectedAmount) {
        _injectedAmount = _transferFrom(rewardToken, _msgSender(), _amount, _minAmount);
        _updateReward(_injectedAmount);
        emit InjectRewards(_msgSender(), _injectedAmount, _amount);
    }

    ///
    /// Viewables
    ///

    // returns the pending rewards
    function getPendingRewards(address _staker) external view virtual returns (uint256 pendingRewards) {
        Stake storage _stake = stakes[_staker];
        pendingRewards = _stake.pending;
        if (_stake.amount > 0) pendingRewards += (_stake.amount * (dividend - _stake.dividend)) / PRECISION;
    }

    function getStakeOf(address _staker) public view virtual returns (Stake memory _stake) {
        _stake = stakes[_staker];
    }

    function getStakers(uint256 _limit, uint256 _offset) external view virtual returns (StakersStake[] memory _stakers, uint256 _count) {
        _count = getStakersCount();
        _limit = _maxLimit(_limit, _offset, _count);
        _stakers = new StakersStake[](_limit);
        for (uint256 _start = 0; _start + _offset < _limit + _offset; _start++) {
            address staker = stakers.at(_start + _offset);
            _stakers[_start].staker = staker;
            _stakers[_start].amount = stakes[staker].amount;
            _stakers[_start].pending = stakes[staker].pending;
            _stakers[_start].dividend = stakes[staker].dividend;
        }
    }

    function getStakersCount() public view virtual returns (uint256 _count) {
        _count = stakers.length();
    }

    ///
    /// Internals
    ///

    function _update(address _staker, int256 _amount) internal virtual returns (uint256 _pending) {
        Stake storage _stake = stakes[_staker];

        if (_stake.amount > 0) _pending = (_stake.pending += (_stake.amount * (dividend - _stake.dividend)) / PRECISION);
        else _pending = _stake.pending;

        _stake.dividend = dividend;

        uint256 stakeAmount = _stake.amount;

        if (_amount != 0) {
            // when the current stake amount of the staker is 0, we assume that this is a new staker joining the protocol
            if (stakeAmount == 0) stakers.add(_staker);

            unchecked {
                staked += uint128(uint256(_amount));
                stakeAmount += uint256(_amount);
            }

            if (staked > type(uint128).max) revert Staking__AmountOverflow();
            if (stakeAmount > type(uint128).max) revert Staking__AmountOverflow();

            // when the current stake amount of the staker is 0, we assume that this staker has withdrawn his stake and is no staker anymore
            if (stakeAmount == 0) stakers.remove(_staker);

            _stake.amount = uint128(stakeAmount);
            emit Update(_staker, _amount);
        }
    }

    // has to be used when deposit is being done or fees being applied
    function _updateReward(uint256 _amount) internal virtual {
        if (staked == 0) revert Staking__NoStakes();
        uint256 _available = (_amount * PRECISION) + remainder;
        dividend += _available / staked;
        remainder += _available % staked;
    }

    function _transferFrom(address _token, address _from, uint256 _amount, uint256 _minAmount) internal returns (uint256 _actualAmount) {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransferFrom(_from, address(this), _amount);
        _actualAmount = IERC20(_token).balanceOf(address(this)) - balance;

        if (_actualAmount == 0) revert Staking__AmountZero();
        if (_actualAmount > type(uint128).max) revert Staking__AmountOverflow();
        if (_actualAmount < _minAmount) revert Staking__AmountReceivedInsufficient(_actualAmount, _minAmount);
    }

    ///
    /// modifier wrapper
    ///

    /// processes the payment of a given receiver
    /// @param _receivers fee receiver address
    function _processValue(address[] calldata _receivers) private {
        uint256 _value = msg.value;
        uint256 _recipients = _receivers.length;
        if (_value > 0) {
            if (_recipients > 0) {
                uint256 _share = _value / _recipients;
                uint256 _shareRest = _value % _recipients;
                for (uint256 i = 0; i < _recipients; ) {
                    if (_receivers[i] == address(0)) revert Staking__AddressZero();
                    uint256 _sendValue = _share + (_shareRest = 0);
                    Address.sendValue(payable(_receivers[i]), _sendValue);
                    emit ServiceFee(_receivers[i], _sendValue);
                    unchecked {
                        _value -= _sendValue;
                        i++;
                    }
                }
            } else revert Staking__ValueNotAllowed();
        }
    }

    function _maxLimit(uint256 limit, uint256 offset, uint256 count) internal pure returns (uint256) {
        if (limit + offset > count && offset < count) return count - offset;
        else if (limit + offset <= count) return limit;
        else return 0;
    }
}
