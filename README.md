# land-auction

Contracts for the LAND auction

# Contract Interface

## LANDAuctionStorage.sol

```solidity
contract LANDAuctionStorage {
    uint256 constant public PERCENTAGE_OF_TOKEN_TO_KEEP = 5;
    uint256 constant public MAX_DECIMALS = 18;

    enum Status { created, started, finished }

    struct tokenAllowed {
        uint256 decimals;
        bool shouldKeepToken;
        bool isAllowed;
    }

    Status public status;

    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal startedTime;
    uint256 internal duration;

    uint256 public gasPriceLimit;
    uint256 public landsLimitPerBid;
    MANAToken public manaToken;
    LANDRegistry public landRegistry;
    ITokenConverter public dex;
    mapping (address => TokenAllowed) public tokensAllowed;

    event AuctionCreated(
      address indexed _caller,
      uint256 _initialPrice,
      uint256 _endPrice,
      uint256 _duration
    );

    event AuctionStarted(
      address indexed _caller,
      uint256 _time
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

    event MANABurned(
      address indexed _caller,
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
}
```

## LANDAuction.sol

```solidity
contract LANDAuction is Ownable, LANDAuctionStorage {

    /**
    * @dev Constructor of the contract
    * @param _initialPrice - uint256 initial LAND price
    * @param _endPrice - uint256 end LAND price
    * @param _duration - uint256 duration of the auction in seconds
    * @param _manaToken - address of the MANA token
    * @param _landRegistry - address of the LANDRegistry
    * @param _dex - address of the Dex to convert ERC20 tokens allowed to MANA
    */
    constructor(
        uint256 _initialPrice,
        uint256 _endPrice,
        uint256 _duration,
        ERC20 _manaToken,
        LANDRegistry _landRegistry,
        address _dex
    ) public;

    /**
    * @dev Start the auction
    * @param _landsLimit - uint256 LANDs limit for a single bid
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function startAuction(uint256 _landsLimit, uint256 _gasPriceLimit) external onlyOwner;

    /**
    * @dev Calculate LAND price based on time
    * It is a linear function y = ax - b. But The slope should be negative.
    * Based on two points (initialPrice; startedTime = 0) and (endPrice; endTime = duration)
    * slope = (endPrice - startedPrice) / (duration - startedTime)
    * As Solidity does not support negative number we use it as: y = b - ax
    * @param _time - uint256 time passed before reach duration
    * @return uint256 price for the given time
    */
    function _getPrice(uint256 _time) internal view returns (uint256);

    /**
    * @dev Current LAND price. If the auction was not started returns the started price
    * @return uint256 current LAND price
    */
    function getCurrentPrice() public view returns (uint256);

    /**
    * @dev Make a bid for LANDs
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function bid(
        uint256[] _xs,
        uint256[] _ys,
        address _beneficiary,
        ERC20 _fromToken
    ) external;

    /**
    * @dev Burn the MANA earned by the auction
    */
    function burnFunds() external;

    /**
    * @dev Finish auction
    */
    function finishAuction() public onlyOwner;

    /**
    * @dev Set LANDs limit for the auction
    * @param _landsLimitPerBid - uint256 LANDs limit for a single id
    */
    function setLandsLimitPerBid(uint256 _landsLimit) public onlyOwner;

    /**
    * @dev Set gas price limit for the auction
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function setGasPriceLimit(uint256 _gasPriceLimit) public onlyOwner;

    /**
    * @dev Allow many ERC20 tokens to to be used for bidding
    * @param _address - array of addresses of the ERC20 Token
    * @param _decimals - array of uint256 of the number of decimals
    * @param _shouldKeepToken - array of boolean whether we should keep the token or not
    */
    function allowManyTokens(
        address[] _address,
        uint256[] _decimals,
        bool[] _shouldKeepToken
    ) external onlyOwner;

    /**
    * @dev Set dex to convert ERC20
    * @param _dex - address of the token converter
    */
    function setDex(address _dex) public onlyOwner;

    /**
    * @dev Allow ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    * @param _decimals - uint256 of the number of decimals
    * @param _shouldKeepToken - boolean whether we should keep the token or not
    */
    function allowToken(
        address _address,
        uint256 _decimals,
        bool _shouldKeepToken)
    public onlyOwner;

    /**
    * @dev Disable ERC20 to to be used for bidding
    * @param _address - address of the ERC20 Token
    */
    function disableToken(address _address) public onlyOwner;

    /**
    * @dev Convert allowed token to MANA and transfer the change in MANA to the sender
    * Note that we will use the slippageRate cause it has a 3% buffer
    * @param _fromToken - ERC20 token to be converted
    * @param _totalPrice - uint256 of the total amount in MANA
    * @return bool to confirm the convertion was successfully
    */
    function convertSafe(ERC20 _fromToken, uint256 _totalPrice) internal returns (bool);

    /**
    * @dev Validate bid function params
    * @param _xs - uint256[] x values for the LANDs to bid
    * @param _ys - uint256[] y values for the LANDs to bid
    * @param _beneficiary - address beneficiary for the LANDs to bid
    * @param _fromToken - token used to bid
    */
    function validateBidParameters(
        int[] _xs,
        int[] _ys,
        address _beneficiary,
        ERC20 _fromToken
    ) internal view;

}
```
