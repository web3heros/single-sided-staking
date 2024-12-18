// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { StakingBase, SafeERC20, IERC20 } from "./base/StakingBase.sol";
import { IStakingOverTimeReward } from "./../interfaces/templates/IStakingOverTimeReward.sol";
import "hardhat/console.sol";

contract StakingOverTimeReward is StakingBase, IStakingOverTimeReward {
    using SafeERC20 for IERC20;

    uint256 public totalRewards;
    uint256 public totalClaimed;

    uint64 public lockPeriod;
    uint64 public timeStart;
    uint64 public timeEnd;

    mapping(address staker => uint256 amount) claimed;

    /// @inheritdoc IStakingOverTimeReward
    function updateConfig(bytes calldata _args, address[] calldata _referrals) external payable virtual onlyOwner processValue(_referrals) {
        if (timeStart > 0) revert StakingOverTimeReward__StartedAlready();
        _updateConfig(_args);
    }

    /// @inheritdoc IStakingOverTimeReward
    function announce(address[] calldata _referrals) external payable virtual onlyOwner nonReentrant processValue(_referrals) {
        _transferFrom(rewardToken, _msgSender(), totalRewards, totalRewards);
        emit Announced();
    }

    /// @inheritdoc IStakingOverTimeReward
    function purge(address[] calldata _referrals) external payable virtual onlyOwner nonReentrant processValue(_referrals) {
        if (staked > 0) revert StakingOverTimeReward__HasStakers();
        IERC20(rewardToken).safeTransfer(_msgSender(), totalRewards);
        if (!paused()) _pause();
        timeStart = 0;
        timeEnd = 0;
        emit Purged();
    }

    /// @inheritdoc IStakingOverTimeReward
    function open(address[] calldata _referrals) external payable virtual onlyOwner processValue(_referrals) {
        _unpause();
        emit Opened();
    }

    /// @inheritdoc IStakingOverTimeReward
    function start(address[] calldata _referrals) external payable virtual onlyOwner processValue(_referrals) returns (uint64, uint64) {
        if (paused()) revert StakingOverTimeReward__NotStarted();
        if (staked == 0) revert StakingOverTimeReward__NoStakers();
        timeStart = uint64(block.timestamp);
        timeEnd = timeStart + lockPeriod;
        emit Started();
        return (timeStart, timeEnd);
    }

    /// @inheritdoc StakingBase
    function getPendingRewards(address _staker) public view virtual override(StakingBase) returns (uint256 pendingRewards) {
        pendingRewards = _absoluteShareForPeriodByStake(stakes[_staker].amount) - claimed[_staker];
    }

    function getClaimedRewards(address _staker) external view virtual returns (uint256 claimedRewards) {
        claimedRewards = claimed[_staker];
    }

    ///
    /// Internals
    ///

    ///
    /// Disable Features
    ///
    function enable(bool, address[] calldata) external payable override(StakingBase) {
        revert StakingOverTimeReward__EnablingInvalid();
    }

    function _injectRewards(uint256, uint256) internal pure override(StakingBase) returns (uint256) {
        revert StakingOverTimeReward__InjectRewardsInvalid();
    }

    function _restake() internal pure override(StakingBase) returns (uint256) {
        revert StakingOverTimeReward__RestakeInvalid();
    }

    ///
    /// Overrides
    ///
    function _initialize(address _stakingToken, address _owner, bytes calldata _args) internal virtual override {
        super._initialize(_stakingToken, _owner, _args);
        _updateConfig(_args);
    }

    /// @inheritdoc StakingBase
    function _deposit(address _staker, uint256 _amount, uint256 _minAmount) internal virtual override returns (uint256 _depositAmount) {
        if (timeStart > 0) revert StakingOverTimeReward__StartedAlready();
        _depositAmount = super._deposit(_staker, _amount, _minAmount);
    }

    // custom doc
    function _withdraw(address _receiver, uint256) internal virtual override returns (uint256 _withdrawAmount) {
        if (block.timestamp < timeEnd) revert StakingOverTimeReward__NotFinished();
        _claimRewards(_receiver);
        _withdrawAmount = super._withdraw(_receiver, stakes[_msgSender()].amount);
    }

    /// @inheritdoc StakingBase
    function _claimRewards(address _receiver) internal virtual override(StakingBase) returns (uint256 _claimAmount) {
        if (_receiver == address(0)) revert StakingOverTimeReward__AddressZero();
        uint256 _stakeAmount = stakes[_msgSender()].amount;
        if ((timeStart & timeEnd & _stakeAmount & staked & totalRewards) > 0) {
            _claimAmount = getPendingRewards(_msgSender());
            if (_claimAmount > 0) {
                claimed[_msgSender()] += _claimAmount;
                IERC20(rewardToken).safeTransfer(_receiver, _claimAmount);
                emit Claim(_msgSender(), _claimAmount);
            }
        }
    }

    ///
    /// Custom
    ///
    function _updateConfig(bytes calldata _args) internal virtual {
        (totalRewards, rewardToken, lockPeriod) = abi.decode(_args, (uint256, address, uint64));
        if (rewardToken == address(0)) revert StakingOverTimeReward__AddressZero();
        if (totalRewards == 0 || lockPeriod == 0) revert StakingOverTimeReward__AmountZero();
        emit UpdateConfig(totalRewards, rewardToken, lockPeriod);
    }

    // TODO test if the share is correct calculated  because of timestamp < end
    function _absoluteShareForPeriodByStake(uint256 _stake) private view returns (uint256 _absoluteShare) {
        _absoluteShare = ((_stake * totalRewards) / staked);
        if (block.timestamp < timeEnd) _absoluteShare = (_absoluteShare * (block.timestamp - timeStart)) / lockPeriod;
    }
}
