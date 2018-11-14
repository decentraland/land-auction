pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/ERC20.sol";

contract ERC20WithoutBurn is ERC20 {
    function mint(uint256 amount, address beneficiary) public {
        _mint(beneficiary, amount);
    }

    function setBalance(uint256 amount) public {
        _mint(msg.sender, amount);
    }
}