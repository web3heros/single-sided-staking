// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { StakingBase } from "./base/StakingBase.sol";
import { IStakingCustomReward } from "./../interfaces/templates/IStakingCustomReward.sol";

contract StakingCustomReward is StakingBase, IStakingCustomReward {
    /// @inheritdoc StakingBase
    function _initialize(address _stakingToken, address _owner, bytes calldata _args) internal virtual override {
        super._initialize(_stakingToken, _owner, _args);
        rewardToken = abi.decode(_args, (address));
        if (rewardToken == address(0)) revert StakingCustomReward__AddressZero();
    }
}
