# land-auction

Contracts for the LAND auction

# Contract Interface

## LANDAuctionStorage.sol

```solidity
contract LANDAuctionStorage {
    enum Status { created, started, finished }

    Status public status;

    uint256 internal initialPrice;
    uint256 internal endPrice;
    uint256 internal startedTime;
    uint256 internal duration;

    uint256 public gasPriceLimit;
    uint256 public landsLimitPerBid;
    MANAToken public manaToken;
    LANDRegistry public landRegistry;

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

    event BidSuccessful(
        address indexed _beneficiary,
        uint256 _price,
        uint256 _totalPrice,
        uint256[] _xs,
        uint256[] _ys
    );

    event AuctionEnded(
        address _caller,
        uint256 _time,
        uint256 _price
    );

    event MANABurned(
        address indexed _caller,
        uint256 _total
    );

    event LandsLimitPerBidChanged(
        uint256 _oldLandsLimit,
        uint256 _landsLimit
    );

    event GasPriceLimitChanged(
        uint256 _oldGasPriceLimit,
        uint256 _gasPriceLimit
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
    */
    constructor(uint256 _initialPrice, uint256 _endPrice, uint256 _duration, address _manaToken, address _landRegistry) public;

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
    function _getPrice(uint256 _time) internal view returns (uint256)

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
    */
    function bid(uint256[] _xs, uint256[] _ys, address _beneficiary) external;

    /**
    * @dev Burn the MANA earned by the auction
    */
    function burnFunds() external;

    /**
    * @dev Finish auction
    */
    function finishAuction() public onlyOwner

    /**
    * @dev Set LANDs limit for the auction
    * @param _landsLimitPerBid - uint256 LANDs limit for a single id
    */
    function setLandsLimitPerBid(uint256 _landsLimit) public onlyOwner

    /**
    * @dev Set gas price limit for the auction
    * @param _gasPriceLimit - uint256 gas price limit for a single bid
    */
    function setGasPriceLimit(uint256 _gasPriceLimit) public onlyOwner

}
```
