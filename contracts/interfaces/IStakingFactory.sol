// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingFactory {
    error StakingFactory__InvalidType();
    error StakingFactory__AddressZero();

    event ImplementationUpdated(uint96 stakingType, address implementation);
    event Created(address indexed deployer, address indexed owner, address indexed protocol, uint256 paid);

    struct StakingCreateParams {
        address stakingToken;
        address deployer;
        address owner;
        bytes args;
    }

    function createStaking(StakingCreateParams calldata _params) external payable returns (address _stakingProtocol);

    function getProtocols(uint256 _limit, uint256 _offset) external view returns (address[] memory _response, uint256 _count);

    function getProtocolsCount() external view returns (uint256 _count);

    function getProtocolsForDeployer(
        address _deployer,
        uint256 _limit,
        uint256 _offset
    ) external view returns (address[] memory _response, uint256 _count);

    function getProtocolsForDeployerCount(address _deployer) external view returns (uint256 _count);
}
