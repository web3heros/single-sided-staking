// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Pausable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";

contract ERC20Mock is ERC20Pausable {
    constructor() ERC20("ERC20Mock", "ERC20Mock") {
        _mint(msg.sender, 10000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(uint256 amount) public virtual {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) public virtual {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    function disable() public {
        _pause();
    }

    function enable() public {
        _unpause();
    }

    bool doAssetErrorOnTransfer = false;

    function enableAssetErrorOnTransfer(bool _enable) external {
        doAssetErrorOnTransfer = _enable;
    }

    bool doRevertErrorOnTransfer = false;

    function enableRevertErrorOnTransfer(bool _enable) external {
        doRevertErrorOnTransfer = _enable;
    }

    function _update(address from, address to, uint256 amount) internal virtual override {
        super._update(from, to, amount);
        require(!paused(), "ERC20Pausable: token transfer while paused");

        if (doRevertErrorOnTransfer) revert("error");

        assert(!doAssetErrorOnTransfer);
    }
}
