pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/ERC20.sol";

contract ERC20WithoutReturningValueOnTransfer is ERC20 {
    function mint(uint256 amount, address beneficiary) public {
        _mint(beneficiary, amount);
    }

    function setBalance(uint256 amount) public {
        _mint(msg.sender, amount);
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        super.transfer(_to, _value);
    }
       
    function transferFrom(address _from, address _to, uint256 _value)
    public returns (bool)
    {
        super.transferFrom(_from, _to, _value);
    }
}