# land-auction

Contracts for the LAND auction

# Contract Interface

## LANDAuctionStorage.sol

```solidity
contract LANDAuctionStorage {
    uint256 constant public PERCENTAGE_OF_TOKEN_BALANCE = 5;
    uint256 constant public MAX_DECIMALS = 18;

    enum Status { created, finished }

    struct Func {
        uint256 slope;
        uint256 base;
        uint256 limit;
    }

    struct Token {
        uint256 decimals;
        bool shouldBurnTokens;
        bool shouldForwardTokens;
        address forwardTarget;
        bool isAllowed;
    }

    uint256 public conversionFee = 105;
    uint256 public totalBids = 0;
    Status public status;
    uint256 public gasPriceLimit;
    uint256 public landsLimitPerBid;
    ERC20 public manaToken;
    LANDRegistry public landRegistry;
    ITokenConverter public dex;
    mapping (address => Token) public tokensAllowed;
    uint256 public totalManaBurned = 0;
    uint256 public startTime;
    uint256 public endTime;

    Func[] internal curves;
    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal duration;

    event AuctionCreated(
      address indexed _caller,
      uint256 _startTime,
      uint256 _duration,
      uint256 _initialPrice,
      uint256 _endPrice
    );

    event BidConversion(
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

    event TokenTransferred(
      uint256 _bidId,
      address indexed _token,
      address indexed _to,
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
      bool _shouldForwardTokens,
      bool _shouldBurnTokens,
      address indexed _forwardTarget
    );

    event TokenDisabled(
      address indexed _caller,
      address indexed _address
    );

    event ConversionFeeChanged(
      address indexed _caller,
      uint256 _oldConversionFee,
      uint256 _conversionFee
    );
}
```

## LANDAuction.sol

```solidity
contract LANDAuction is Ownable, LANDAuctionStorage {
    /**
    * @dev Constructor of the contract.
    * Note that the last value of _xPoints will be the total duration and
    * the first value of _yPoints will be the initial price and the last value will be the endPrice
    * @param _xPoints - uint256[] of seconds
    * @param _yPoints - uint256[] of prices
    * @param _startTime - uint256 timestamp in seconds when the auction will start
    * @param _landsLimitPerBid - uint256 LANDs limit for a single bid
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    * @param _manaToken - address of the MANA token
    * @param _landRegistry - address of the LANDRegistry
    * @param _dex - address of the Dex to convert ERC20 tokens allowed to MANA
    */
    constructor(
        uint256[] _xPoints,
        uint256[] _yPoints,
        uint256 _startTime,
        uint256 _landsLimitPerBid,
        uint256 _gasPriceLimit,
        ERC20 _manaToken,
        LANDRegistry _landRegistry,
        address _dex
    ) public;

    /**
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function bid(
        int[] _xs,
        int[] _ys,
        address _beneficiary,
        ERC20 _fromToken
    ) external;

    /**
    * @dev Validate bid function params
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function _validateBidParameters(
        int[] _xs,
        int[] _ys,
        address _beneficiary,
        ERC20 _fromToken
    ) internal view;

    /**
    * @dev Current LAND price.
    * Note that if the auction has not started returns the initial price and when
    * the auction is finished return the endPrice
    * @return uint256 current LAND price
    */
    function getCurrentPrice() public view returns (uint256);

    /**
    * @dev Convert allowed token to MANA and transfer the change in the original token
    * Note that we will use the slippageRate cause it has a 3% buffer and a deposit of 5% to cover
    * the conversion fee.
    * @param _bidId - uint256 of the bid Id
    * @param _fromToken - ERC20 token to be converted
    * @param _bidPriceInMana - uint256 of the total amount in MANA
    * @return uint256 of the total amount of MANA to burn
    */
    function _convertSafe(
        uint256 _bidId,
        ERC20 _fromToken,
        uint256 _bidPriceInMana
    ) internal returns (uint256 requiredManaAmountToBurn);

    /**
    * @dev Get exchange rate
    * @param _srcToken - IERC20 token
    * @param _destToken - IERC20 token
    * @param _srcAmount - uint256 amount to be converted
    * @return uint256 of the rate
    */
    function getRate(
        IERC20 _srcToken,
        IERC20 _destToken,
        uint256 _srcAmount
    ) public view returns (uint256 rate);

    /**
    * @dev Calculate the amount of tokens to process
    * @param _totalPrice - uint256 price to calculate percentage to process
    * @param _tokenRate - rate to calculate the amount of tokens
    * @return uint256 of the amount of tokens required
    */
    function _calculateRequiredTokenBalance(
        uint256 _totalPrice,
        uint256 _tokenRate
    )
    internal pure returns (uint256);

    /**
    * @dev Calculate the total price in MANA
    * Note that PERCENTAGE_OF_TOKEN_BALANCE will be always less than 100
    * @param _totalPrice - uint256 price to calculate percentage to keep
    * @return uint256 of the new total price in MANA
    */
    function _calculateRequiredManaAmount(
        uint256 _totalPrice
    )
    internal pure returns (uint256);

    /**
    * @dev Burn or forward the MANA and other tokens earned
    * @param _bidId - uint256 of the bid Id
    * @param _token - ERC20 token
    */
    function _processFunds(uint256 _bidId, ERC20 _token) internal;

    /**
    * @dev LAND price based on time
    * Note that will select the function to calculate based on the time
    * It should return endPrice if _time < duration
    * @param _time - uint256 time passed before reach duration
    * @return uint256 price for the given time
    */
    function _getPrice(uint256 _time) internal view returns (uint256);

    /**
    * @dev Burn tokens
    * @param _bidId - uint256 of the bid Id
    * @param _token - ERC20 token
    */
    function _burnTokens(uint256 _bidId, ERC20 _token) private;

    /**
    * @dev Forward tokens
    * @param _bidId - uint256 of the bid Id
    * @param _address - address to send the tokens to
    * @param _token - ERC20 token
    */
    function _forwardTokens(uint256 _bidId, address _address, ERC20 _token) private;

    /**
    * @dev Set conversion fee rate
    * @param _fee - uint256 for the new conversion rate
    */
    function setConversionFee(uint256 _fee) external onlyOwner;

    /**
    * @dev Finish auction
    */
    function finishAuction() public onlyOwner;

    /**
    * @dev Set LANDs limit for the auction
    * @param _landsLimitPerBid - uint256 LAND limit for a single id
    */
    function setLandsLimitPerBid(uint256 _landsLimitPerBid) public onlyOwner;

    /**
    * @dev Set gas price limit for the auction
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function setGasPriceLimit(uint256 _gasPriceLimit) public onlyOwner;

    /**
    * @dev Set dex to convert ERC20
    * @param _dex - address of the token converter
    */
    function setDex(address _dex) public onlyOwner;

     /**
    * @dev Allow ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    * @param _decimals - uint256 of the number of decimals
    * @param _shouldBurnTokens - boolean whether we should burn funds
    * @param _shouldForwardTokens - boolean whether we should transferred funds
    * @param _forwardTarget - address where the funds will be transferred
    */
    function allowToken(
        address _address,
        uint256 _decimals,
        bool _shouldBurnTokens,
        bool _shouldForwardTokens,
        address _forwardTarget
    )
    public onlyOwner;

    /**
    * @dev Disable ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    */
    function disableToken(address _address) public onlyOwner;

     /**
    * @dev Create a combined function.
    * note that we will set N - 1 function combinations based on N points (x,y)
    * @param _xPoints - uint256[] of x values
    * @param _yPoints - uint256[] of y values
    */
    function _setCurve(uint256[] _xPoints, uint256[] _yPoints) internal;

    /**
    * @dev Calculate base and slope for the given points
    * It is a linear function y = ax - b. But The slope should be negative.
    * As we want to avoid negative numbers in favor of using uints we use it as: y = b - ax
    * Based on two points (x1; x2) and (y1; y2)
    * base = (x2 * y1) - (x1 * y2) / x2 - x1
    * slope = (y1 - y2) / (x2 - x1) to avoid negative maths
    * @param _x1 - uint256 x1 value
    * @param _x2 - uint256 x2 value
    * @param _y1 - uint256 y1 value
    * @param _y2 - uint256 y2 value
    * @return uint256 for the base
    * @return uint256 for the slope
    */
    function _getFunc(
        uint256 _x1,
        uint256 _x2,
        uint256 _y1,
        uint256 _y2
    ) internal pure returns (uint256 base, uint256 slope);

    /**
    * @dev Return bid id
    * @return uint256 of the bid id
    */
    function _getBidId() private view returns (uint256);

    /**
    * @dev Normalize to _fromToken decimals
    * @param _decimals - uint256 of _fromToken decimals
    * @param _value - uint256 of the amount to normalize
    */
    function _normalizeDecimals(
        uint256 _decimals,
        uint256 _value
    )
    internal pure returns (uint256 _result);

    /**
    * @dev Update stats. It will update the following stats:
    * - totalBids
    * - totalLandsBidded
    * - totalManaBurned
    * @param _landsBidded - uint256 of the number of LAND bidded
    * @param _manaAmountBurned - uint256 of the amount of MANA burned
    */
    function _updateStats(uint256 _landsBidded, uint256 _manaAmountBurned) private;
}
```
