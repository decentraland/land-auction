pragma solidity ^0.4.24;

import "../dex/ITokenConverter.sol";


/**
* @title ERC20 Interface with burn
* @dev IERC20 imported in ItokenConverter.sol
*/
contract ERC20 is IERC20 {
    function burn(uint256 _value) public;
}


/**
* @title Interface for contracts conforming to ERC-721
*/
contract LANDRegistry {
    function assignMultipleParcels(int[] x, int[] y, address beneficiary) external;
}


contract LANDAuctionStorage {
    uint256 constant public PERCENTAGE_OF_TOKEN_TO_KEEP = 5;
    uint256 constant public MAX_DECIMALS = 18;

    enum Status { created, finished }

    struct Func {
        uint256 slope;
        uint256 base;
        uint256 limit;
    }
    struct Token {
        uint256 decimals;
        bool shouldKeepToken;
        bool isAllowed;
    }

    uint256 public convertionFee = 105;
    uint256 public totalBids = 0;
    Status public status;
    uint256 public gasPriceLimit;
    uint256 public landsLimitPerBid;
    ERC20 public manaToken;
    ERC20 public daiToken;
    LANDRegistry public landRegistry;
    address public daiCharity;
    address public tokenKiller;
    ITokenConverter public dex;
    mapping (address => Token) public tokensAllowed;
    Func[] internal curves;

    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal startTime;
    uint256 internal duration;

    event AuctionCreated(
      address indexed _caller,
      uint256 _startTime,
      uint256 _duration,
      uint256 _initialPrice,
      uint256 _endPrice
    );

    event BidConvertion(
      uint256 _bidId,
      address indexed _token,
      uint256 _totalPriceInMana,
      uint256 _totalPriceInToken,
      uint256 _tokensKept
    );

    event BidSuccessful(
      uint256 _bidId,
      address indexed _beneficiary,
      address indexed _token,
      uint256 _price,
      uint256 _totalPrice,
      int[] _xs,
      int[] _ys
    );

    event AuctionEnded(
      address indexed _caller,
      uint256 _time,
      uint256 _price
    );

    event TokenBurned(
      uint256 _bidId,
      address indexed _token,
      uint256 _total
    );

    event LandsLimitPerBidChanged(
      address indexed _caller,
      uint256 _oldLandsLimitPerBid, 
      uint256 _landsLimitPerBid
    );

    event GasPriceLimitChanged(
      address indexed _caller,
      uint256 _oldGasPriceLimit,
      uint256 _gasPriceLimit
    );

    event DexChanged(
      address indexed _caller,
      address indexed _oldDex,
      address indexed _dex
    );

    event TokenAllowed(
      address indexed _caller,
      address indexed _address,
      uint256 _decimals,
      bool _shouldKeepToken
    );

    event TokenDisabled(
      address indexed _caller,
      address indexed _address
    );

    event ConvertionFeeChanged(
      address indexed _caller,
      uint256 _oldConvertionFee,
      uint256 _convertionFee
    );
}