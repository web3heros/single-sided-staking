// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingActionFees {
    error StakingActionFees__ZeroFee();
    error StakingActionFees__InvalidFee();
    error StakingActionFees__AddressZero();
    error StakingActionFees__AmountZero();
    error StakingActionFees__InvalidAmount();

    event UpdateFees(uint16 depositFee, uint16 withdrawFee, uint16 restakeFee);

    function updateFees(uint16 _depositFee, uint16 _withdrawFee, uint16 _restakeFee, address[] calldata _referrals) external payable;
}
