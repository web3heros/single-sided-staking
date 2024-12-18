// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingBase {
    error Staking__NoStakes();
    error Staking__AmountZero();
    error Staking__AmountOverflow();
    error Staking__AmountReceivedInsufficient(uint256 actualAmount, uint256 minAmount);
    error Staking__ValueNotAllowed();
    error Staking__OverflowAmounts();
    error Staking__AddressZero();
    error Staking__InvalidAmount();

    event Update(address indexed staker, int256 amount);
    event Claim(address indexed staker, uint256 amount);
    event Restaked(address indexed staker, uint256 amount);
    event InjectRewards(address indexed actor, uint256 amountInjected, uint256 amountGiven);
    event ServiceFee(address indexed provider, uint256 paymentAmount);

    struct Stake {
        uint128 amount;
        uint256 pending;
        uint256 dividend;
    }

    struct StakersStake {
        address staker;
        uint128 amount;
        uint256 pending;
        uint256 dividend;
    }

    function initialize(address stakingToken, address owner, bytes calldata args) external;

    function deposit(
        address staker,
        uint256 amount,
        uint256 minAmount,
        address[] calldata referrals
    ) external payable returns (uint256 depositAmount);

    function withdraw(address receiver, uint256 amount, address[] calldata referrals) external payable returns (uint256 withdrawAmount);

    function restake(address[] calldata referrals) external payable returns (uint256 restakeAmount);

    function claimRewards(address receiver, address[] calldata referrals) external payable returns (uint256 claimAmount);

    function injectRewards(
        uint256 amount,
        uint256 minAmount,
        address[] calldata referrals
    ) external payable returns (uint256 injectedAmount);

    function staked() external view returns (uint128);

    function stakingToken() external view returns (address);

    function rewardToken() external view returns (address);

    function getPendingRewards(address staker) external view returns (uint256 pendingRewards);
}
