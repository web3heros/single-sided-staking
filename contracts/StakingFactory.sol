// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { IStakingFactory } from "./interfaces/IStakingFactory.sol";
import { IStakingBase } from "./interfaces/templates/base/IStakingBase.sol";

contract StakingFactory is IStakingFactory {
    using EnumerableSet for EnumerableSet.AddressSet;

    address public immutable implementation;

    mapping(address deployer => EnumerableSet.AddressSet protocol) private _protocols;

    address[] private allProtocols;

    constructor(address _implementation) {
        implementation = _implementation;
    }

    function createStaking(StakingCreateParams calldata _params) external payable returns (address _stakingProtocol) {
        if (_params.deployer == address(0)) revert StakingFactory__AddressZero();
        _stakingProtocol = Clones.clone(implementation);
        IStakingBase(_stakingProtocol).initialize(_params.stakingToken, _params.owner, _params.args);
        allProtocols.push(_stakingProtocol);
        _protocols[_params.deployer].add(_stakingProtocol);
        if (msg.value > 0) Address.sendValue(payable(_params.deployer), msg.value);
        emit Created(_params.deployer, _params.owner, _stakingProtocol, msg.value);
    }

    function getProtocols(uint256 _limit, uint256 _offset) external view returns (address[] memory _response, uint256 _count) {
        _count = getProtocolsCount();
        _limit = _maxLimit(_limit, _offset, _count);
        _response = new address[](_limit);
        for (uint256 _start = 0; _start + _offset < _limit + _offset; _start++) _response[_start] = allProtocols[_start + _offset];
    }

    function getProtocolsCount() public view returns (uint256 _count) {
        _count = allProtocols.length;
    }

    function getProtocolsForDeployer(
        address _deployer,
        uint256 _limit,
        uint256 _offset
    ) external view returns (address[] memory _response, uint256 _count) {
        _count = getProtocolsForDeployerCount(_deployer);
        _limit = _maxLimit(_limit, _offset, _count);
        _response = new address[](_limit);
        for (uint256 _start = 0; _start + _offset < _limit + _offset; _start++)
            _response[_start] = _protocols[_deployer].at(_start + _offset);
    }

    function getProtocolsForDeployerCount(address _deployer) public view returns (uint256 _count) {
        _count = _protocols[_deployer].length();
    }

    function _maxLimit(uint256 limit, uint256 offset, uint256 count) internal pure returns (uint256) {
        if (limit + offset > count && offset < count) return count - offset;
        else if (limit + offset <= count) return limit;
        else return 0;
    }
}
