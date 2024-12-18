// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingOverTimeReward {
    error StakingOverTimeReward__InjectRewardsInvalid();
    error StakingOverTimeReward__EnablingInvalid();
    error StakingOverTimeReward__RestakeInvalid();
    error StakingOverTimeReward__ClaimInvalid();
    error StakingOverTimeReward__AddressZero();
    error StakingOverTimeReward__AmountZero();
    error StakingOverTimeReward__StartedAlready();
    error StakingOverTimeReward__NotStarted();
    error StakingOverTimeReward__NotFinished();
    error StakingOverTimeReward__WithdrawInvalid();
    error StakingOverTimeReward__LockPeriodInvalid();
    error StakingOverTimeReward__HasStakers();
    error StakingOverTimeReward__NoRewards();
    error StakingOverTimeReward__NoStakers();

    event Started();
    event Opened();
    event Announced();
    event Purged();
    event UpdateConfig(uint256 totalRewards, address rewardToken, uint64 lockPeriod);

    function totalRewards() external view returns (uint256);

    function totalClaimed() external view returns (uint256);

    function lockPeriod() external view returns (uint64);

    function timeStart() external view returns (uint64);

    function timeEnd() external view returns (uint64);

    function getClaimedRewards(address _staker) external view returns (uint256 claimedRewards);

    function updateConfig(bytes calldata _args, address[] calldata _referrals) external payable;

    function announce(address[] calldata _referrals) external payable;

    function purge(address[] calldata _referrals) external payable;

    function open(address[] calldata _referrals) external payable;

    function start(address[] calldata referrals) external payable returns (uint64 timeStart, uint64 timeEnd);
}
