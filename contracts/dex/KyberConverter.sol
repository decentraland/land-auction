pragma solidity ^0.4.24;

import "./ITokenConverter.sol";
import "./IKyberNetwork.sol";


/**
* @dev Contract to encapsulate Kyber methods which implements ITokenConverter.
* Note that need to create it with a valid kyber address
*/
contract KyberConverter is ITokenConverter {
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
        uint256 _minReturn
    ) 
    external payable returns (uint256 amount) 
    {
        // Transfer tokens to be converted from msg.sender to this contract
        require(
            _srcToken.transferFrom(msg.sender, address(this), _srcAmount),
            "Could not transfer _srcToken to this contract"
        );
        // Approve Kyber to use _srcToken on belhalf of this contract
        require(
            _srcToken.approve(kyber, _srcAmount),
            "Could not approve kyber to use _srcToken on behalf of this contract"
        );

        uint256 minRate;
        (, minRate) = getExpectedRate(_srcToken, _destToken, _minReturn);

        // Trade _srcAmount from _srcToken to _destToken
        amount = kyber.trade(
            _srcToken,
            _srcAmount,
            _destToken,
            address(this),
            MAX_UINT,
            minRate,
            walletId
        );
        // Clean kyber to use _srcTokens on belhalf of this contract
        require(
            _srcToken.approve(kyber, 0),
            "Could not clean approval of kyber to use _srcToken on behalf of this contract"
        );
        // Check if the amount traded is greater or equal to the minimum required
        require(amount >= _minReturn, "Min return not reached");
        // Transfer amount of _destTokens to msf.sender
        require(
            _destToken.transfer(msg.sender, amount),
            "Could not transfer amount of _destToken to msg.sender"
        );
    }

    function getExpectedRate(IERC20 _srcToken, IERC20 _destToken, uint256 _srcAmount) 
    public view returns(uint256 expectedRate, uint256 slippageRate) 
    {
        (expectedRate, slippageRate) = kyber.getExpectedRate(_srcToken, _destToken, _srcAmount);
    }
}