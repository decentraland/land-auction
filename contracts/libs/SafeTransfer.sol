pragma solidity ^0.4.24;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";


/**
* @dev Library to perform transfer for ERC20 tokens.
* Not all the tokens transfer method has a return value (bool) neither revert for insufficient funds or 
* unathorized _value
*/
library SafeTransfer {
    /**
    * @dev Transfer token for a specified address
    * @param _token erc20 The address of the ERC20 contract
    * @param _to address The address which you want to transfer to
    * @param _value uint256 the _value of tokens to be transferred
    */
    function safeTransfer(IERC20 _token, address _to, uint256 _value) internal returns (bool) {
        uint256 prevBalance = _token.balanceOf(address(this));

        require(prevBalance >= _value, "Insufficient funds");

        _token.transfer(_to, _value);

        require(prevBalance - _value == _token.balanceOf(address(this)), "Transfer failed");

        return true;
    }

    /**
    * @dev Transfer tokens from one address to another
    * @param _token erc20 The address of the ERC20 contract
    * @param _from address The address which you want to send tokens from
    * @param _to address The address which you want to transfer to
    * @param _value uint256 the _value of tokens to be transferred
    */
    function safeTransferFrom(
        IERC20 _token,
        address _from,
        address _to, 
        uint256 _value
    ) internal returns (bool) 
    {
        uint256 prevBalance = _token.balanceOf(_from);

        require(prevBalance >= _value, "Insufficient funds");
        require(_token.allowance(_from, address(this)) >= _value, "Insufficient allowance");

        _token.transferFrom(_from, _to, _value);

        require(prevBalance - _value == _token.balanceOf(_from), "Transfer failed");

        return true;
    }
}