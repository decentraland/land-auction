pragma solidity ^0.4.24;

import "./ITokenConverter.sol";
import "./IKyberNetwork.sol";
import "../libs/SafeTransfer.sol";


/**
* @dev Contract to encapsulate Kyber methods which implements ITokenConverter.
* Note that need to create it with a valid kyber address
*/
contract KyberConverter is ITokenConverter {
    using SafeTransfer for IERC20;

    IKyberNetwork internal  kyber;
    uint256 private constant MAX_UINT = uint256(0) - 1;
    address internal walletId;

    constructor (IKyberNetwork _kyber, address _walletId) public {
        kyber = _kyber;
        walletId = _walletId;
    }
    
    function convert(
        IERC20 _srcToken,
        IERC20 _destToken,
        uint256 _srcAmount,
        uint256 _destAmount
    ) 
    external returns (uint256)
    {
        // Save prev src token balance 
        uint256 prevSrcBalance = _srcToken.balanceOf(address(this));

        // Transfer tokens to be converted from msg.sender to this contract
        require(
            _srcToken.safeTransferFrom(msg.sender, address(this), _srcAmount),
            "Could not transfer _srcToken to this contract"
        );

        // Approve Kyber to use _srcToken on belhalf of this contract
        require(
            _srcToken.approve(kyber, _srcAmount),
            "Could not approve kyber to use _srcToken on behalf of this contract"
        );

        // Trade _srcAmount from _srcToken to _destToken
        // Note that minConversionRate is set to 0 cause we want the lower rate possible
        uint256 amount = kyber.trade(
            _srcToken,
            _srcAmount,
            _destToken,
            address(this),
            _destAmount,
            0,
            walletId
        );

        // Clean kyber to use _srcTokens on belhalf of this contract
        require(
            _srcToken.approve(kyber, 0),
            "Could not clean approval of kyber to use _srcToken on behalf of this contract"
        );

        // Check if the amount traded is equal to the expected one
        require(amount == _destAmount, "Amount bought is not equal to dest amount");

        // Return the change of src token
        uint256 change = _srcToken.balanceOf(address(this)).sub(prevSrcBalance);
        require(
            _srcToken.safeTransfer(msg.sender, change),
            "Could not transfer change to sender"
        );


        // Transfer amount of _destTokens to msg.sender
        require(
            _destToken.safeTransfer(msg.sender, amount),
            "Could not transfer amount of _destToken to msg.sender"
        );

        return change;
    }

    function getExpectedRate(IERC20 _srcToken, IERC20 _destToken, uint256 _srcAmount) 
    public view returns(uint256 expectedRate, uint256 slippageRate) 
    {
        (expectedRate, slippageRate) = kyber.getExpectedRate(_srcToken, _destToken, _srcAmount);
    }
}