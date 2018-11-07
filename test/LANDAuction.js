import { assertRevert } from 'openzeppelin-eth/test/helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const LANDAuction = artifacts.require('LANDAuction')
const ERC20Token = artifacts.require('ERC20Test')
const AssetRegistryToken = artifacts.require('AssetRegistryTest')
const KyberConverter = artifacts.require('KyberConverter.sol')
const KyberMock = artifacts.require('KyberMock.sol')

const AUCTION_STATUS_OP_CODES = {
  created: 0,
  started: 1,
  finished: 2
}

function getBlockchainTime(blockNumber = 'latest') {
  return web3.eth.getBlock(blockNumber).timestamp
}

function parseFloatWithDecimal(num, decimals = 2) {
  return parseFloat(parseFloat(num).toFixed(decimals))
}

function weiToDecimal(num) {
  return parseFloatWithDecimal(web3.fromWei(num))
}

function normalizeEvent(log) {
  const newArgs = {}
  const { args } = log
  for (let key in args) {
    newArgs[key] = args[key]
    // _price, _totalPrice and _total to wei & two decimals due different round method between languages
    if (key === '_price' || key === '_totalPrice' || key === '_total') {
      newArgs[key] = weiToDecimal(args[key]).toString()
    }
  }
  return {
    ...log,
    args: newArgs
  }
}

function assertEvent(log, expectedEventName, expectedArgs) {
  const { event, args } = log
  event.should.be.eq(expectedEventName)

  if (expectedArgs) {
    for (let key in expectedArgs) {
      let value = args[key]
      if (key === '_xs' || key === '_ys') {
        for (let i = 0; i < value.length; i++) {
          value[i]
            .toString()
            .should.be.equal(
              expectedArgs[key][i].toString(),
              `[assertEvent] ${key}`
            )
        }
      } else {
        if (value instanceof BigNumber) {
          value = value.toString()
        }

        value.should.be.equal(expectedArgs[key], `[assertEvent] ${key}`)
      }
    }
  }
}

async function getEvents(contract, eventName) {
  return new Promise((resolve, reject) => {
    contract[eventName]().get(function(err, logs) {
      if (err) reject(new Error(`Error fetching the ${eventName} events`))
      resolve(logs)
    })
  })
}

contract('LANDAuction', function([
  _,
  owner,
  bidder,
  anotherBidder,
  bidderWithoutFunds,
  hacker
]) {
  const initialPrice = web3.toWei(0.5, 'ether')
  const endPrice = web3.toWei(0.1, 'ether')
  const auctionDuration = duration.days(15)
  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const landsLimitPerBid = 20
  const gasPriceLimit = 4
  const xs = [1, 2, 3, 4]
  const ys = [1, 2, 3, 4]

  let initialTime

  let landAuction
  let manaToken
  let nchToken
  let dclToken
  let landRegistry
  let kyberConverter
  let kyberMock

  const fromOwner = { from: owner }
  const fromBidder = { from: bidder }
  const fromAnotherBidder = { from: anotherBidder }
  const fromBidderWithoutFunds = { from: bidderWithoutFunds }
  const fromHacker = { from: hacker }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }

  const getPriceWithLinearFunction = time => {
    let price =
      initialPrice - ((initialPrice - endPrice) * time) / auctionDuration
    if (time < 0) {
      price = initialPrice
    } else if (time > auctionDuration) {
      price = endPrice
    }
    return weiToDecimal(price)
  }

  const getCurrentPrice = async () => {
    const price = await landAuction.getCurrentPrice()
    return weiToDecimal(price.toNumber())
  }

  async function getBidTotal(xs, ys, bidder) {
    const { logs } = await landAuction.bid(xs, ys, bidder, manaToken.address, {
      ...{ from: bidder },
      gasPrice: gasPriceLimit
    })
    return logs[0].args._totalPrice
  }

  beforeEach(async function() {
    // Create tokens
    manaToken = await ERC20Token.new(creationParams)
    nchToken = await ERC20Token.new(creationParams)
    dclToken = await ERC20Token.new(creationParams)
    landRegistry = await AssetRegistryToken.new(creationParams)

    // create KyberMock
    kyberMock = await KyberMock.new(nchToken.address, dclToken.address)
    // Assign balance to KyberMock
    await manaToken.mint(web3.toWei(10, 'ether'), kyberMock.address)

    // Create KyberConverter
    kyberConverter = await KyberConverter.new(kyberMock.address, owner)
    // Create a LANDAuction
    landAuction = await LANDAuction.new(
      initialPrice,
      endPrice,
      auctionDuration,
      manaToken.address,
      landRegistry.address,
      kyberConverter.address,
      [nchToken.address, dclToken.address],
      fromOwner
    )
    // Start auction
    await landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromOwner)
    initialTime = getBlockchainTime()

    // Assign balance to bidders and allow LANDAuction to move MANA
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromBidder)
    await manaToken.setBalance(web3.toWei(10, 'ether'), fromAnotherBidder)
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromBidder
    )
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromAnotherBidder
    )

    // Supply bidders with other erc20 tokens and approve landAuction
    await nchToken.setBalance(web3.toWei(10, 'ether'), fromBidder)
    await nchToken.setBalance(web3.toWei(10, 'ether'), fromAnotherBidder)
    await dclToken.setBalance(web3.toWei(10, 'ether'), fromBidder)
    await dclToken.setBalance(web3.toWei(10, 'ether'), fromAnotherBidder)
    await nchToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromBidder
    )
    await nchToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromAnotherBidder
    )
    await dclToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromBidder
    )
    await dclToken.approve(
      landAuction.address,
      web3.toWei(10, 'ether'),
      fromAnotherBidder
    )
  })

  describe('constructor', function() {
    it('should create with correct values', async function() {
      const _landAuction = await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        kyberConverter.address,
        [],
        fromOwner
      )

      let logs = await getEvents(_landAuction, 'AuctionCreated')
      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'AuctionCreated', {
        _caller: owner,
        _initialPrice: initialPrice.toString(),
        _endPrice: endPrice.toString(),
        _duration: auctionDuration.toString()
      })

      logs = await getEvents(_landAuction, 'TokenAllowed')
      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'TokenAllowed', {
        _caller: owner,
        _address: manaToken.address
      })

      const currentLANDPrice = await _landAuction.getCurrentPrice()
      currentLANDPrice.should.be.bignumber.equal(initialPrice)

      const status = await _landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.created)
    })

    it('should create without dex', async function() {
      await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        0,
        [],
        fromOwner
      )
    })

    it('should create with allowed tokens', async function() {
      await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        kyberConverter.address,
        [nchToken.address, dclToken.address],
        fromOwner
      )
    })

    it('reverts if creator creates with incorrect values :: initialPrice = 0', async function() {
      await assertRevert(
        LANDAuction.new(
          0,
          0,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: initialPrice < endPrice', async function() {
      await assertRevert(
        LANDAuction.new(
          endPrice - 1,
          endPrice,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: duration < 1 day', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          duration.days(1),
          manaToken.address,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: manaToken not a valid contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          zeroAddress,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          0,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          owner,
          landRegistry.address,
          kyberConverter.address,
          [],
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: landRegistry not a valid contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          zeroAddress,
          kyberConverter.address,
          [],
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          0,
          kyberConverter.address,
          [],
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          endPrice - 1,
          endPrice,
          auctionDuration,
          manaToken.address,
          owner,
          kyberConverter.address,
          [],
          fromOwner
        )
      )
    })

    it('reverts if instanciate with incorrect values :: dex not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          bidder,
          [],
          fromOwner
        )
      )
    })

    it('reverts if instanciate with incorrect values :: AllowedTokens not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          initialPrice,
          endPrice,
          auctionDuration,
          manaToken.address,
          landRegistry.address,
          kyberConverter.address,
          [bidder],
          fromOwner
        )
      )
    })
  })

  describe('startAuction', function() {
    let _landAuction
    beforeEach(async function() {
      _landAuction = await LANDAuction.new(
        initialPrice,
        endPrice,
        auctionDuration,
        manaToken.address,
        landRegistry.address,
        kyberConverter.address,
        [],
        fromOwner
      )
    })

    it('should start auction', async function() {
      const { logs } = await _landAuction.startAuction(
        landsLimitPerBid,
        gasPriceLimit,
        fromOwner
      )

      logs.length.should.be.equal(3)

      assertEvent(logs[0], 'LandsLimitPerBidChanged', {
        _caller: owner,
        _oldLandsLimitPerBid: '0',
        _landsLimitPerBid: landsLimitPerBid.toString()
      })

      assertEvent(logs[1], 'GasPriceLimitChanged', {
        _caller: owner,
        _oldGasPriceLimit: '0',
        _gasPriceLimit: gasPriceLimit.toString()
      })

      assertEvent(logs[2], 'AuctionStarted', {
        _caller: owner,
        _time: getBlockchainTime().toString()
      })

      const status = await _landAuction.status()
      const _landLimit = await _landAuction.landsLimitPerBid()
      const _gasPriceLimit = await _landAuction.gasPriceLimit()

      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.started)
      _landLimit.should.be.bignumber.equal(landsLimitPerBid)
      _gasPriceLimit.should.be.bignumber.equal(gasPriceLimit)
    })

    it('reverts when trying to re-start auction', async function() {
      await _landAuction.startAuction(
        landsLimitPerBid,
        gasPriceLimit,
        fromOwner
      )
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromOwner)
      )
    })

    it('reverts when no-owner trying to start auction', async function() {
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, gasPriceLimit, fromHacker)
      )
    })

    it('reverts when landLimit = 0', async function() {
      await assertRevert(_landAuction.startAuction(0, gasPriceLimit, fromOwner))
    })

    it('reverts when gasPriceLimit = 0', async function() {
      await assertRevert(
        _landAuction.startAuction(landsLimitPerBid, 0, fromOwner)
      )
    })
  })

  describe('setLandsLimitPerBid', function() {
    it('should change lands limit', async function() {
      let _landLimit = await landAuction.landsLimitPerBid()
      _landLimit.should.be.bignumber.equal(landsLimitPerBid)

      await landAuction.setLandsLimitPerBid(40, fromOwner)

      _landLimit = await landAuction.landsLimitPerBid()
      _landLimit.should.be.bignumber.equal(40)
    })

    it('reverts when changing to 0', async function() {
      await assertRevert(landAuction.setLandsLimitPerBid(0, fromOwner))
    })

    it('reverts when no-owner trying to change it', async function() {
      await assertRevert(
        landAuction.setLandsLimitPerBid(landsLimitPerBid, fromHacker)
      )
    })
  })

  describe('setGasPriceLimit', function() {
    it('should change gas price limit', async function() {
      const newGasPriceLimit = 8
      let _gasPriceLimit = await landAuction.gasPriceLimit()
      _gasPriceLimit.should.be.bignumber.equal(gasPriceLimit)

      await landAuction.setGasPriceLimit(newGasPriceLimit, fromOwner)

      _gasPriceLimit = await landAuction.gasPriceLimit()
      _gasPriceLimit.should.be.bignumber.equal(newGasPriceLimit)
    })

    it('reverts when changing to 0', async function() {
      await assertRevert(landAuction.setGasPriceLimit(0, fromOwner))
    })

    it('reverts when no-owner trying to change it', async function() {
      await assertRevert(
        landAuction.setGasPriceLimit(gasPriceLimit, fromHacker)
      )
    })
  })

  describe('finishAuction', function() {
    it('should finish auction', async function() {
      const { logs } = await landAuction.finishAuction(fromOwner)
      const time = getBlockchainTime()

      logs.length.should.be.equal(1)

      assertEvent(normalizeEvent(logs[0]), 'AuctionEnded', {
        _caller: owner,
        _time: time.toString(),
        _price: getPriceWithLinearFunction(time - initialTime).toString()
      })

      const status = await landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.finished)
    })

    it('reverts when trying to re-finish auction', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(landAuction.finishAuction(fromOwner))
    })

    it('reverts when no-owner finishing auction', async function() {
      await assertRevert(landAuction.finishAuction(fromHacker))
    })
  })

  describe('getCurrentPrice', function() {
    it('should get current price', async function() {
      // Day 0
      let oldPrice = await getCurrentPrice()
      let price = oldPrice
      let time = getBlockchainTime()
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))

      // Day 5
      await increaseTime(duration.days(5))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14
      await increaseTime(duration.days(9))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14 and 10 hours
      await increaseTime(duration.hours(10))
      price = await getCurrentPrice()
      time = getBlockchainTime()
      price.should.be.lt(oldPrice)
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
    })

    it('should get end price when auction time finished', async function() {
      await increaseTime(auctionDuration)
      let price = await landAuction.getCurrentPrice()

      price.should.be.bignumber.equal(endPrice)

      await increaseTime(duration.days(1))
      price = await landAuction.getCurrentPrice()

      price.should.be.bignumber.equal(endPrice)
    })
  })

  describe('bid', function() {
    it('should bid', async function() {
      const { logs } = await landAuction.bid(
        xs,
        ys,
        bidder,
        manaToken.address,
        {
          ...fromBidder,
          gasPrice: gasPriceLimit
        }
      )

      const time = getBlockchainTime(logs[0].blockNumber)
      const price = getPriceWithLinearFunction(time - initialTime)

      logs.length.should.be.equal(1)

      assertEvent(
        normalizeEvent(logs[0]),
        'BidSuccessful',
        {
          _beneficiary: bidder,
          _token: manaToken.address,
          _price: price.toString(),
          _totalPrice: (price * xs.length).toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidder)
      }

      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(logs[0].args._totalPrice)
    })

    it('should increase balance of LANDAuction contract', async function() {
      let total = 0
      total = (await getBidTotal(xs, ys, bidder)).plus(total)

      await increaseTime(duration.hours(5))
      total = (await getBidTotal([5], [5], anotherBidder)).plus(total)

      await increaseTime(duration.days(3))
      total = (await getBidTotal([6], [6], bidder)).plus(total)

      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(total)

      let id = await landRegistry._encodeTokenId(5, 5)
      let address = await landRegistry.ownerOf(id)
      address.should.be.equal(anotherBidder)

      id = await landRegistry._encodeTokenId(6, 6)
      address = await landRegistry.ownerOf(id)
      address.should.be.equal(bidder)

      for (let i = 0; i < xs.length; i++) {
        id = await landRegistry._encodeTokenId(xs[i], ys[i])
        address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidder)
      }
    })

    it('should assign LANDs to beneficiary', async function() {
      await landAuction.bid(xs, ys, anotherBidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(anotherBidder)
      }
    })

    it('should bid limit LANDs', async function() {
      await landAuction.bid(
        [-150, 150],
        [-150, 150],
        bidder,
        manaToken.address,
        {
          ...fromBidder,
          gasPrice: gasPriceLimit
        }
      )
    })

    it('should bid with MANA token without dex', async function() {
      await landAuction.setDex(0, fromOwner)
      await landAuction.bid(xs, ys, bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
    })

    it('should bid with other tokens', async function() {
      // Get prev balance of bidder of NCH token
      const bidderNCHPrevBalance = await nchToken.balanceOf(bidder)

      // Bid
      const { logs } = await landAuction.bid(xs, ys, bidder, nchToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      // Check Log
      const time = getBlockchainTime(logs[0].blockNumber)
      const price = getPriceWithLinearFunction(time - initialTime)

      logs.length.should.be.equal(1)

      assertEvent(
        normalizeEvent(logs[0]),
        'BidSuccessful',
        {
          _beneficiary: bidder,
          _token: nchToken.address,
          _price: price.toString(),
          _totalPrice: (price * xs.length).toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      // Check LANDs were assigned
      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidder)
      }

      // Check balance of LAND Auction contract
      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(logs[0].args._totalPrice)

      // Check reserve of kyber and balance of bidder
      const kyberNCHBalance = await nchToken.balanceOf(kyberMock.address)
      const bidderNCHBalance = await nchToken.balanceOf(bidder)
      kyberNCHBalance.should.be.bignumber.gt(0)
      kyberNCHBalance.should.be.bignumber.equal(
        bidderNCHPrevBalance.minus(bidderNCHBalance)
      )
    })

    it('reverts if user bids assigned LANDs', async function() {
      await landAuction.bid(xs, ys, bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      await assertRevert(
        landAuction.bid([1], [1], bidder, manaToken.address, {
          ...fromAnotherBidder,
          gasPrice: gasPriceLimit
        })
      )

      await assertRevert(
        landAuction.bid([1], [1], anotherBidder, manaToken.address, {
          ...fromAnotherBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if bidder has insufficient funds', async function() {
      await assertRevert(
        landAuction.bid(xs, ys, bidderWithoutFunds, manaToken.address, {
          ...fromBidderWithoutFunds,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if bidder has not approved MANA', async function() {
      await manaToken.approve(
        landAuction.address,
        web3.toWei(0.1, 'ether'),
        fromBidder
      )

      await assertRevert(
        landAuction.bid(xs, ys, bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if auction is finished', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(
        landAuction.bid(xs, ys, bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if user bids for empty LAND', async function() {
      await assertRevert(
        landAuction.bid([], [], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if user bids for invalid coordinates', async function() {
      await assertRevert(
        landAuction.bid([1, 2], [3], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if transaction exceeds gas price limit', async function() {
      await assertRevert(
        landAuction.bid(xs, ys, bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit + 1
        })
      )
    })

    it('reverts if user bids out of boundaries LANDs', async function() {
      assertRevert(
        landAuction.bid([-151], [150], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([151], [150], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([150], [-151], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )

      assertRevert(
        landAuction.bid([150], [151], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if user bids when now - initialTime > duration ', async function() {
      await increaseTime(auctionDuration)
      await increaseTime(duration.seconds(1))
      await assertRevert(
        landAuction.bid([1], [1], bidder, manaToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if dex is not a valid contract', async function() {
      await landAuction.setDex(0, fromOwner)
      await assertRevert(
        landAuction.bid(xs, ys, bidder, nchToken.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })

    it('reverts if token is not an allowed token', async function() {
      const erc20 = await ERC20Token.new(creationParams)
      await assertRevert(
        landAuction.bid(xs, ys, bidder, erc20.address, {
          ...fromBidder,
          gasPrice: gasPriceLimit
        })
      )
    })
  })

  describe('burnFunds', function() {
    it('should burnFunds', async function() {
      await increaseTime(duration.days(3))
      await landAuction.bid(xs, ys, bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      const price = await getCurrentPrice()
      await landAuction.finishAuction(fromOwner)
      const { logs } = await landAuction.burnFunds(fromOwner)

      logs.length.should.be.equal(1)

      assertEvent(
        normalizeEvent(logs[0]),
        'MANABurned',
        {
          _caller: owner,
          _total: (price * xs.length).toString()
        },
        true
      )
    })

    it('should execute burnFunds called by another user ', async function() {
      await increaseTime(duration.days(3))
      await landAuction.bid(xs, ys, bidder, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      await landAuction.finishAuction(fromOwner)
      await landAuction.burnFunds(fromHacker)
    })

    it('reverts when trying to burn 0 funds', async function() {
      await landAuction.finishAuction(fromOwner)
      await assertRevert(landAuction.burnFunds(fromOwner))
    })

    it('reverts when trying to burn before finished', async function() {
      await assertRevert(landAuction.burnFunds(fromOwner))
    })
  })

  describe('setDex', function() {
    it('should set dex', async function() {
      let address = await landAuction.dex()
      address.should.be.equal(kyberConverter.address)

      const { logs } = await landAuction.setDex(0, fromOwner)

      assertEvent(logs[0], 'DexChanged', {
        _caller: owner,
        _oldDex: kyberConverter.address,
        _dex: zeroAddress
      })

      address = await landAuction.dex()
      address.should.be.equal(zeroAddress)

      await landAuction.setDex(kyberConverter.address, fromOwner)
      address = await landAuction.dex()
      address.should.be.equal(kyberConverter.address)
    })

    it('reverts when changing to an address which is not a  contract', async function() {
      await assertRevert(landAuction.setDex(bidder, fromOwner))
    })

    it('reverts when trying to change to the current one', async function() {
      await assertRevert(landAuction.setDex(kyberConverter.address, fromOwner))
    })

    it('reverts when no-owner try to change it', async function() {
      await assertRevert(landAuction.setDex(0, fromHacker))
    })
  })

  describe('allowToken', function() {
    it('should allowToken', async function() {
      const erc20 = await ERC20Token.new(creationParams)

      let res = await landAuction.tokensAllowed(erc20.address)
      res.should.be.equal(false)

      const { logs } = await landAuction.allowToken(erc20.address, fromOwner)

      assertEvent(logs[0], 'TokenAllowed', {
        _caller: owner,
        _address: erc20.address
      })

      res = await landAuction.tokensAllowed(erc20.address)
      res.should.be.equal(true)
    })

    it('reverts when allow a token already allowed', async function() {
      await assertRevert(landAuction.allowToken(manaToken.address, fromOwner))
    })

    it('reverts when trying to allow not a contract', async function() {
      await assertRevert(landAuction.allowToken(bidder, fromOwner))
      await assertRevert(landAuction.allowToken(0, fromOwner))
    })

    it('reverts when no-owner try to change it', async function() {
      const erc20 = await ERC20Token.new(creationParams)
      await assertRevert(landAuction.allowToken(erc20.address, fromHacker))
    })
  })

  describe('disableToken', function() {
    it('should disableToken', async function() {
      const erc20 = await ERC20Token.new(creationParams)

      await landAuction.allowToken(erc20.address, fromOwner)
      let res = await landAuction.tokensAllowed(erc20.address)
      res.should.be.equal(true)

      const { logs } = await landAuction.disableToken(erc20.address, fromOwner)

      assertEvent(logs[0], 'TokenDisabled', {
        _caller: owner,
        _address: erc20.address
      })

      res = await landAuction.tokensAllowed(erc20.address)
      res.should.be.equal(false)
    })

    it('reverts when allow a token already allowed', async function() {
      await landAuction.disableToken(manaToken.address, fromOwner)
      await assertRevert(landAuction.disableToken(manaToken.address, fromOwner))

      const erc20 = await ERC20Token.new(creationParams)
      await assertRevert(landAuction.disableToken(erc20.address, fromOwner))
    })

    it('reverts when no-owner try to change it', async function() {
      await assertRevert(
        landAuction.disableToken(manaToken.address, fromHacker)
      )
    })
  })
  //@nacho TODO: add token bidded with real check of reserves
  //@nacho TODO: change to swapTokenToToken
})
