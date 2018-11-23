import { assertRevert } from 'openzeppelin-eth/test/helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const LANDAuction = artifacts.require('LANDAuctionTest')
const ERC20Token = artifacts.require('ERC20Test')
const ERC20WithoutBurn = artifacts.require('ERC20WithoutBurn')
const AssetRegistryToken = artifacts.require('AssetRegistryTest')
const KyberConverter = artifacts.require('KyberConverter')
const KyberMock = artifacts.require('KyberMock')

const AUCTION_STATUS_OP_CODES = {
  created: 0,
  started: 1,
  finished: 2
}

const MAX_DECIMALS = 18
const SPECIAL_DECIMALS = 12

const PERCENTAGE_OF_TOKEN_TO_KEEP = 0.05
const CONVERTION_FEE = 105

function getBlockchainTime(blockNumber = 'latest') {
  return web3.eth.getBlock(blockNumber).timestamp
}

function parseFloatWithDecimal(num, decimals = 1) {
  return parseFloat(parseFloat(num).toFixed(decimals))
}

function weiToDecimal(num) {
  return parseFloatWithDecimal(web3.fromWei(num))
}

function scientificToDecimal(num) {
  //if the number is in scientific notation remove it
  if (/\d+\.?\d*e[+-]*\d+/i.test(num)) {
    var zero = '0',
      parts = String(num)
        .toLowerCase()
        .split('e'), //split into coeff and exponent
      e = parts.pop(), //store the exponential part
      l = Math.abs(e), //get the number of zeros
      sign = e / l,
      coeff_array = parts[0].split('.')
    if (sign === -1) {
      coeff_array[0] = Math.abs(coeff_array[0])
      num = '-' + zero + '.' + new Array(l).join(zero) + coeff_array.join('')
    } else {
      var dec = coeff_array[1]
      if (dec) l = l - dec.length
      num = coeff_array.join('') + new Array(l + 1).join(zero)
    }
  }

  return num
}

function normalizeEvent(log) {
  const newArgs = {}
  const { args } = log
  for (let key in args) {
    newArgs[key] = args[key]
    // _price, _totalPrice and _total to wei & two decimals due different round method between languages
    if (
      key === '_price' ||
      key === '_totalPrice' ||
      key === '_total' ||
      key === '_totalPriceInMana'
    ) {
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
          value = scientificToDecimal(value.toString()).toString()
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
  bidderWithOnlyDAI,
  hacker
]) {
  const initialPrice = web3.toWei(200000, 'ether')
  const endPrice = web3.toWei(1000, 'ether')
  const prices = [
    initialPrice,
    web3.toWei(100000, 'ether'),
    web3.toWei(50000, 'ether'),
    web3.toWei(25000, 'ether'),
    endPrice
  ]

  const auctionDuration = duration.days(15)
  const time = [
    0,
    duration.days(1),
    duration.days(2),
    duration.days(7),
    auctionDuration
  ]

  const PRICES = [
    initialPrice,
    web3.toWei(100000, 'ether'),
    web3.toWei(50000, 'ether'),
    web3.toWei(45000, 'ether'),
    web3.toWei(40000, 'ether'),
    web3.toWei(35000, 'ether'),
    web3.toWei(30000, 'ether'),
    web3.toWei(25000, 'ether'),
    web3.toWei(22000, 'ether'),
    web3.toWei(19000, 'ether'),
    web3.toWei(16000, 'ether'),
    web3.toWei(13000, 'ether'),
    web3.toWei(10000, 'ether'),
    web3.toWei(7000, 'ether'),
    web3.toWei(4000, 'ether'),
    endPrice
  ]

  const zeroAddress = '0x0000000000000000000000000000000000000000'
  const landsLimitPerBid = 20
  const gasPriceLimit = 4
  const xs = [1, 2, 3, 4]
  const ys = [1, 2, 3, 4]

  let initialTime

  let landAuction
  let manaToken
  let daiToken
  let dclToken
  let landRegistry
  let kyberConverter
  let kyberMock
  let daiCharity
  let tokenKiller

  const fromOwner = { from: owner }
  const fromBidder = { from: bidder }
  const fromAnotherBidder = { from: anotherBidder }
  const fromBidderWithoutFunds = { from: bidderWithoutFunds }
  const fromBidderWithOnlyDAI = { from: bidderWithOnlyDAI }
  const fromHacker = { from: hacker }

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }
  const getFunc = _time => {
    for (let i = 0; i < time.length - 1; i++) {
      const x1 = time[i]
      const x2 = time[i + 1]
      const y1 = prices[i]
      const y2 = prices[i + 1]
      if (_time < x2) {
        return { x1, x2, y1, y2 }
      }
    }
  }

  const getPriceWithLinearFunction = (time, toWei = true) => {
    const { x1, x2, y1, y2 } = getFunc(time)

    const b = ((x2 * y1 - x1 * y2) * 10 ** 18) / (x2 - x1)
    const slope = ((y1 - y2) * time * 10 ** 18) / (x2 - x1)
    let price = (b - slope) / 10 ** 18

    if (time <= 0) {
      price = initialPrice
    } else if (time >= auctionDuration) {
      price = endPrice
    }

    if (toWei) {
      return weiToDecimal(price)
    }
    return price
  }

  const getCurrentPrice = async () => {
    const price = await landAuction.getCurrentPrice()
    return weiToDecimal(price.toNumber())
  }

  beforeEach(async function() {
    // Create tokens
    manaToken = await ERC20Token.new(creationParams)
    daiToken = await ERC20Token.new(creationParams)
    dclToken = await ERC20WithoutBurn.new(creationParams)
    landRegistry = await AssetRegistryToken.new(creationParams)

    // Create Fake contracts
    daiCharity = await ERC20Token.new(creationParams)
    tokenKiller = await ERC20Token.new(creationParams)

    // create KyberMock
    kyberMock = await KyberMock.new(
      [daiToken.address, dclToken.address],
      [MAX_DECIMALS, SPECIAL_DECIMALS],
      creationParams
    )

    // Assign balance to KyberMock
    await manaToken.mint(web3.toWei(10000000, 'ether'), kyberMock.address)

    // Create KyberConverter
    kyberConverter = await KyberConverter.new(kyberMock.address, owner)
    // Create a LANDAuction
    landAuction = await LANDAuction.new(
      time,
      prices,
      manaToken.address,
      daiToken.address,
      landRegistry.address,
      kyberConverter.address,
      daiCharity.address,
      tokenKiller.address,
      fromOwner
    )

    // Assign balance to bidders and allow LANDAuction to move MANA
    await manaToken.setBalance(web3.toWei(10000000, 'ether'), fromBidder)
    await manaToken.setBalance(web3.toWei(10000000, 'ether'), fromAnotherBidder)
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10000000, 'ether'),
      fromBidder
    )
    await manaToken.approve(
      landAuction.address,
      web3.toWei(10000000, 'ether'),
      fromAnotherBidder
    )

    // Supply bidders with other erc20 tokens and approve landAuction
    await daiToken.setBalance(web3.toWei(200000000, 'ether'), fromBidder)
    await daiToken.setBalance(web3.toWei(200000000, 'ether'), fromAnotherBidder)
    await daiToken.setBalance(
      web3.toWei(200000000, 'ether'),
      fromBidderWithOnlyDAI
    )
    await dclToken.setBalance(web3.toWei(3000000000000, 'Mwei'), fromBidder) // 2,000,000  ether cause it is 12 decimals contract
    await dclToken.setBalance(
      web3.toWei(3000000000000, 'Mwei'),
      fromAnotherBidder
    ) // 2,000,000 ether cause it is 12 decimals contract
    await daiToken.approve(
      landAuction.address,
      web3.toWei(200000000, 'ether'),
      fromBidder
    )
    await daiToken.approve(
      landAuction.address,
      web3.toWei(200000000, 'ether'),
      fromAnotherBidder
    )
    await daiToken.approve(
      landAuction.address,
      web3.toWei(10000000, 'ether'),
      fromBidderWithOnlyDAI
    )
    await dclToken.approve(
      landAuction.address,
      web3.toWei(3000000000000, 'ether'),
      fromBidder
    )
    await dclToken.approve(
      landAuction.address,
      web3.toWei(3000000000000, 'ether'),
      fromAnotherBidder
    )

    // Start auction
    const { logs } = await landAuction.startAuction(
      landsLimitPerBid,
      gasPriceLimit,
      fromOwner
    )
    initialTime = logs[2].args._time
  })

  describe('constructor', function() {
    it('should create with correct values', async function() {
      const _landAuction = await LANDAuction.new(
        time,
        prices,
        manaToken.address,
        daiToken.address,
        landRegistry.address,
        kyberConverter.address,
        daiCharity.address,
        tokenKiller.address,
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
      logs.length.should.be.equal(2)
      assertEvent(logs[0], 'TokenAllowed', {
        _caller: owner,
        _address: manaToken.address
      })

      assertEvent(logs[1], 'TokenAllowed', {
        _caller: owner,
        _address: daiToken.address
      })

      const currentLANDPrice = await _landAuction.getCurrentPrice()
      currentLANDPrice.should.be.bignumber.equal(initialPrice)

      const status = await _landAuction.status()
      status.should.be.bignumber.equal(AUCTION_STATUS_OP_CODES.created)
    })

    it('should create with allowed tokens', async function() {
      await LANDAuction.new(
        time,
        prices,
        manaToken.address,
        daiToken.address,
        landRegistry.address,
        kyberConverter.address,
        daiCharity.address,
        tokenKiller.address,
        fromOwner
      )
    })

    it('reverts if creator creates with incorrect values :: initialPrice = 0', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          [0, ...prices],
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: initialPrice < endPrice', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          [...prices, initialPrice],
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: duration < 1 day', async function() {
      await assertRevert(
        LANDAuction.new(
          [...time, duration.days(1)],
          prices,
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: manaToken not a valid contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          zeroAddress,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          0,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          owner,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: landRegistry not a valid contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          zeroAddress,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          0,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          owner,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if instanciate with incorrect values :: dex not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          bidder,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if creator creates with incorrect values :: daiToken not a valid contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          zeroAddress,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          0,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )

      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          owner,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          tokenKiller.address,
          fromOwner
        )
      )
    })

    it('reverts if instanciate with incorrect values :: daiCharity not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          bidder,
          daiCharity.address,
          fromOwner
        )
      )
    })

    it('reverts if instanciate with incorrect values :: tokenKiller not a contract address', async function() {
      await assertRevert(
        LANDAuction.new(
          time,
          prices,
          manaToken.address,
          daiToken.address,
          landRegistry.address,
          kyberConverter.address,
          daiCharity.address,
          bidder,
          fromOwner
        )
      )
    })
  })

  describe('startAuction', function() {
    let _landAuction
    beforeEach(async function() {
      _landAuction = await LANDAuction.new(
        time,
        prices,
        manaToken.address,
        daiToken.address,
        landRegistry.address,
        kyberConverter.address,
        daiCharity.address,
        tokenKiller.address,
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
    it('should match desire prices', async function() {
      for (let i = 0; i < 20; i++) {
        const price = await landAuction.getPrice(duration.days(i))
        weiToDecimal(price).should.be.equal(weiToDecimal(PRICES[i] || endPrice))
      }
    })

    it('should get current price', async function() {
      // Day 0
      let oldPrice = await getCurrentPrice()
      let price = oldPrice
      let time = getBlockchainTime()
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))

      // Day 5
      await increaseTime(duration.days(5))
      price = await getCurrentPrice()
      price.should.be.lt(oldPrice)
      time = getBlockchainTime()
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14
      await increaseTime(duration.days(8))
      price = await getCurrentPrice()
      price.should.be.lt(oldPrice)
      time = getBlockchainTime()
      price.should.be.equal(getPriceWithLinearFunction(time - initialTime))
      oldPrice = price

      // Day 14 and 10 hours
      await increaseTime(duration.hours(10))
      price = await getCurrentPrice()
      price.should.be.lt(oldPrice)
      time = getBlockchainTime()
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
      const totalPrice = price * xs.length

      logs.length.should.be.equal(2)

      assertEvent(
        logs[0],
        'TokenBurned',
        {
          _bidId: '0',
          _token: manaToken.address,
          _total: scientificToDecimal(logs[1].args._totalPrice)
        },
        true
      )

      assertEvent(
        normalizeEvent(logs[1]),
        'BidSuccessful',
        {
          _bidId: '0',
          _beneficiary: bidder,
          _token: manaToken.address,
          _price: price.toString(),
          _totalPrice: totalPrice.toString(),
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
      balance.should.be.bignumber.equal(0)
    })

    it('should increase bid id', async function() {
      let res = await landAuction.bid(xs, ys, bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      assertEvent(
        res.logs[0],
        'TokenBurned',
        {
          _bidId: '0',
          _token: manaToken.address,
          _total: scientificToDecimal(res.logs[1].args._totalPrice)
        },
        true
      )
      assertEvent(
        normalizeEvent(res.logs[1]),
        'BidSuccessful',
        {
          _bidId: '0',
          _xs: xs,
          _ys: ys
        },
        true
      )

      res = await landAuction.bid([10], [11], bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      assertEvent(
        res.logs[0],
        'TokenBurned',
        {
          _bidId: '1',
          _token: manaToken.address,
          _total: scientificToDecimal(res.logs[1].args._totalPrice)
        },
        true
      )
      assertEvent(
        normalizeEvent(res.logs[1]),
        'BidSuccessful',
        {
          _bidId: '1',
          _xs: [10],
          _ys: [11]
        },
        true
      )

      res = await landAuction.bid([12], [13], bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      assertEvent(
        res.logs[0],
        'TokenBurned',
        {
          _bidId: '2',
          _token: manaToken.address,
          _total: scientificToDecimal(res.logs[1].args._totalPrice)
        },
        true
      )
      assertEvent(
        normalizeEvent(res.logs[1]),
        'BidSuccessful',
        {
          _bidId: '2',
          _xs: [12],
          _ys: [13]
        },
        true
      )
    })

    it('should keep balance of LANDAuction contract at 0', async function() {
      await landAuction.bid(xs, ys, bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      await landAuction.bid([5], [5], anotherBidder, manaToken.address, {
        ...fromAnotherBidder,
        gasPrice: gasPriceLimit
      })

      await landAuction.bid([6], [6], bidder, manaToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

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
      // Remove keep of percentage from DAI
      await landAuction.disableToken(daiToken.address, fromOwner)
      await landAuction.allowToken(daiToken.address, 18, false, fromOwner)

      // Get prev balance of bidder of DAI token
      const bidderDAIPrevBalance = await daiToken.balanceOf(bidderWithOnlyDAI)

      // Bid
      const { logs } = await landAuction.bid(
        xs,
        ys,
        bidderWithOnlyDAI,
        daiToken.address,
        {
          ...fromBidderWithOnlyDAI,
          gasPrice: gasPriceLimit
        }
      )
      logs.length.should.be.equal(3)

      // Check Log
      const time = getBlockchainTime(logs[0].blockNumber) - initialTime
      const price = getPriceWithLinearFunction(time - initialTime)
      const totalPrice = price * xs.length
      const totalPriceInToken = await kyberMock.getReturn(
        manaToken.address,
        daiToken.address,
        logs[0].args._totalPriceInMana
      )

      assertEvent(
        normalizeEvent(logs[0]),
        'BidConvertion',
        {
          _bidId: '0',
          _token: daiToken.address,
          _totalPriceInMana: totalPrice.toString(),
          _totalPriceInToken: scientificToDecimal(totalPriceInToken),
          _tokensKept: '0'
        },
        true
      )

      assertEvent(
        logs[1],
        'TokenBurned',
        {
          _bidId: '0',
          _token: manaToken.address,
          _total: scientificToDecimal(logs[0].args._totalPriceInMana)
        },
        true
      )

      assertEvent(
        normalizeEvent(logs[2]),
        'BidSuccessful',
        {
          _bidId: '0',
          _beneficiary: bidderWithOnlyDAI,
          _token: daiToken.address,
          _price: price.toString(),
          _totalPrice: weiToDecimal(
            getPriceWithLinearFunction(time, false) * xs.length
          ).toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      // Check LANDs were assigned
      for (let i = 0; i < xs.length; i++) {
        const id = await landRegistry._encodeTokenId(xs[i], ys[i])
        const address = await landRegistry.ownerOf(id)
        address.should.be.equal(bidderWithOnlyDAI)
      }

      // Check balance of LAND Auction contract
      const landAuctionMANABalance = await manaToken.balanceOf(
        landAuction.address
      )
      landAuctionMANABalance.should.be.bignumber.equal(0)

      const landAuctionDAIBalance = await daiToken.balanceOf(
        landAuction.address
      )
      landAuctionDAIBalance.should.be.bignumber.equal(0)

      // Check reserve of kyber and balance of bidderWithOnlyDAI
      const kyberDAIBalance = await daiToken.balanceOf(kyberMock.address)
      const bidderWithOnlyDAIBalance = await daiToken.balanceOf(
        bidderWithOnlyDAI
      )
      kyberDAIBalance.should.be.bignumber.gt(0)
      kyberDAIBalance.should.be.bignumber.equal(
        bidderDAIPrevBalance.minus(bidderWithOnlyDAIBalance)
      )

      const manaBalanceOfBidderWithOnlyDAIBalance = await manaToken.balanceOf(
        bidderWithOnlyDAIBalance
      )
      manaBalanceOfBidderWithOnlyDAIBalance.should.be.bignumber.equal(0)
    })

    it(`should bid with a token with ${SPECIAL_DECIMALS} decimals`, async function() {
      // Allow token
      await landAuction.allowManyTokens(
        [dclToken.address],
        [SPECIAL_DECIMALS],
        [false],
        fromOwner
      )

      // Get prev balance of bidder of DAI token
      const bidderDCLPrevBalance = await dclToken.balanceOf(bidder)

      // Bid
      const { logs } = await landAuction.bid(xs, ys, bidder, dclToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      logs.length.should.be.equal(3)

      // Check Log
      const time = getBlockchainTime(logs[0].blockNumber) - initialTime
      const price = getPriceWithLinearFunction(time - initialTime)

      // add 1 cause we do the same in the contract to ensure the min MANA to buy
      // when dealing with tokens with less decimals than MANA
      const totalPriceInToken = await kyberMock.getReturn(
        manaToken.address,
        dclToken.address,
        logs[0].args._totalPriceInMana
      )

      assertEvent(
        normalizeEvent(logs[0]),
        'BidConvertion',
        {
          _bidId: '0',
          _token: dclToken.address,
          _totalPriceInMana: weiToDecimal(
            getPriceWithLinearFunction(time, false) * xs.length
          ).toString(),
          _totalPriceInToken: totalPriceInToken.toString(),
          _tokensKept: '0'
        },
        true
      )

      assertEvent(
        logs[1],
        'TokenBurned',
        {
          _bidId: '0',
          _token: manaToken.address,
          _total: scientificToDecimal(logs[0].args._totalPriceInMana)
        },
        true
      )

      assertEvent(
        normalizeEvent(logs[2]),
        'BidSuccessful',
        {
          _bidId: '0',
          _beneficiary: bidder,
          _token: dclToken.address,
          _price: price.toString(),
          _totalPrice: weiToDecimal(
            getPriceWithLinearFunction(time, false) * xs.length
          ).toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      // Check balance of LAND Auction contract
      const balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check reserve of kyber and balance of bidder
      const kyberDCLBalance = await dclToken.balanceOf(kyberMock.address)
      const bidderDCLBalance = await dclToken.balanceOf(bidder)
      kyberDCLBalance.should.be.bignumber.gt(0)
      kyberDCLBalance.should.be.bignumber.equal(
        bidderDCLPrevBalance.minus(bidderDCLBalance)
      )

      // Mana of bidder should keep the same or increase
      const bidderMANABalance = await manaToken.balanceOf(bidder)
      bidderMANABalance.should.be.bignumber.gte(web3.toWei(10, 'ether'))
    })

    it('should bid and keep a percentage of the token', async function() {
      // Get prev balance of bidder of DAI token
      const bidderDAIPrevBalance = await daiToken.balanceOf(bidder)

      // Check MANA balance of LAND Auction contract
      let balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check DAI balance of LAND Auction contract
      balance = await daiToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check balance of dai charity contract
      balance = await daiToken.balanceOf(daiCharity.address)
      balance.should.be.bignumber.equal(0)

      // Bid
      const { logs } = await landAuction.bid(xs, ys, bidder, daiToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })
      logs.length.should.be.equal(4)

      // Check Log
      const time = getBlockchainTime(logs[0].blockNumber)
      const price = getPriceWithLinearFunction(time - initialTime)
      const totalPrice = price * xs.length * (1 - PERCENTAGE_OF_TOKEN_TO_KEEP)
      const totalPriceInToken = await kyberMock.getReturn(
        manaToken.address,
        daiToken.address,
        logs[3].args._price.mul(xs.length)
      )
      // Keep 5% percentage of the token
      const tokensKept = totalPriceInToken.mul(PERCENTAGE_OF_TOKEN_TO_KEEP)

      assertEvent(
        normalizeEvent(logs[0]),
        'BidConvertion',
        {
          _bidId: '0',
          _token: daiToken.address,
          _totalPriceInMana: totalPrice.toString(),
          _totalPriceInToken: scientificToDecimal(totalPriceInToken),
          _tokensKept: tokensKept.toFixed(0) // remove decimal
        },
        true
      )

      assertEvent(
        logs[1],
        'TokenBurned',
        {
          _bidId: '0',
          _token: daiToken.address,
          _total: scientificToDecimal(logs[0].args._tokensKept)
        },
        true
      )

      assertEvent(
        logs[2],
        'TokenBurned',
        {
          _bidId: '0',
          _token: manaToken.address,
          _total: scientificToDecimal(logs[0].args._totalPriceInMana)
        },
        true
      )

      assertEvent(
        normalizeEvent(logs[3]),
        'BidSuccessful',
        {
          _bidId: '0',
          _beneficiary: bidder,
          _token: daiToken.address,
          _price: price.toString(),
          _totalPrice: totalPrice.toString(),
          _xs: xs,
          _ys: ys
        },
        true
      )

      // Check MANA balance of LAND Auction contract
      balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check DAI balance of LAND Auction contract
      balance = await daiToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check balance of dai charity contract
      balance = await daiToken.balanceOf(daiCharity.address)
      balance.should.be.bignumber.equal(logs[0].args._tokensKept)

      // Check balance of bidder
      balance = await daiToken.balanceOf(bidder)
      balance.should.be.bignumber.equal(
        bidderDAIPrevBalance.minus(logs[0].args._totalPriceInToken)
      )
    })

    it('should bid and transfer funds if token does not implement burn', async function() {
      await landAuction.allowManyTokens(
        [dclToken.address],
        [SPECIAL_DECIMALS],
        [true],
        fromOwner
      )

      // Check DCL balance of LAND Auction contract
      let balance = await dclToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check MANA balance of LAND Auction contract
      balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check DCL balance of Token Killer contract
      balance = await dclToken.balanceOf(tokenKiller.address)
      balance.should.be.bignumber.equal(0)

      // Bid
      const { logs } = await landAuction.bid(xs, ys, bidder, dclToken.address, {
        ...fromBidder,
        gasPrice: gasPriceLimit
      })

      // Check DCL balance of LAND Auction contract
      balance = await dclToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check MANA balance of LAND Auction contract
      balance = await manaToken.balanceOf(landAuction.address)
      balance.should.be.bignumber.equal(0)

      // Check DCL balance of Token Killer contract
      balance = await dclToken.balanceOf(tokenKiller.address)
      balance.should.be.bignumber.equal(logs[0].args._tokensKept)
    })

    it('should bid with less gas Price', async function() {
      await landAuction.bid(
        [-150, 150],
        [-150, 150],
        bidder,
        manaToken.address,
        {
          ...fromBidder,
          gasPrice: gasPriceLimit - 1
        }
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
        landAuction.bid(xs, ys, bidder, daiToken.address, {
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

    it('reverts when changing to an address which is not a contract', async function() {
      await assertRevert(landAuction.setDex(bidder, fromOwner))
    })

    it('reverts when trying to change to the current one', async function() {
      await assertRevert(landAuction.setDex(kyberConverter.address, fromOwner))
    })

    it('reverts when no-owner try to change it', async function() {
      await assertRevert(landAuction.setDex(0, fromHacker))
    })
  })

  describe('allowManyTokens', function() {
    it('should allowManyTokens', async function() {
      const erc20 = await ERC20Token.new(creationParams)

      let isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(false)

      isAllowed = (await landAuction.tokensAllowed(dclToken.address))[2]
      isAllowed.should.be.equal(false)

      const { logs } = await landAuction.allowManyTokens(
        [dclToken.address, erc20.address],
        [MAX_DECIMALS, SPECIAL_DECIMALS],
        [true, false],
        fromOwner
      )

      assertEvent(logs[0], 'TokenAllowed', {
        _caller: owner,
        _address: dclToken.address,
        _decimals: MAX_DECIMALS.toString(),
        _shouldKeepToken: true
      })

      assertEvent(logs[1], 'TokenAllowed', {
        _caller: owner,
        _address: erc20.address,
        _decimals: SPECIAL_DECIMALS.toString(),
        _shouldKeepToken: false
      })

      isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(true)

      isAllowed = (await landAuction.tokensAllowed(dclToken.address))[2]
      isAllowed.should.be.equal(true)
    })

    it('reverts when allow tokens with invalid parameteres:: not the same length', async function() {
      await assertRevert(
        landAuction.allowManyTokens(
          [dclToken.address],
          [MAX_DECIMALS, SPECIAL_DECIMALS],
          [false],
          fromOwner
        )
      )

      await assertRevert(
        landAuction.allowManyTokens(
          [dclToken.address],
          [MAX_DECIMALS],
          [false, true],
          fromOwner
        )
      )

      const erc20 = await ERC20Token.new(creationParams)
      await assertRevert(
        landAuction.allowManyTokens(
          [erc20.address, dclToken.address],
          [MAX_DECIMALS],
          [false],
          fromOwner
        )
      )
    })

    it('reverts when no-owner try to change it', async function() {
      await assertRevert(
        landAuction.allowManyTokens(
          [dclToken.address],
          [MAX_DECIMALS],
          [false],
          fromHacker
        )
      )
    })
  })

  describe('allowToken', function() {
    it('should allowToken', async function() {
      const erc20 = await ERC20Token.new(creationParams)

      let isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(false)

      const { logs } = await landAuction.allowToken(
        erc20.address,
        MAX_DECIMALS,
        false,
        fromOwner
      )

      assertEvent(logs[0], 'TokenAllowed', {
        _caller: owner,
        _address: erc20.address,
        _decimals: MAX_DECIMALS.toString(),
        _shouldKeepToken: false
      })

      isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(true)
    })

    it('reverts when allow a token already allowed', async function() {
      await assertRevert(
        landAuction.allowToken(
          manaToken.address,
          MAX_DECIMALS,
          false,
          fromOwner
        )
      )
    })

    it('reverts when trying to allow not a contract', async function() {
      await assertRevert(
        landAuction.allowToken(bidder, MAX_DECIMALS, false, fromOwner)
      )
      await assertRevert(
        landAuction.allowToken(0, MAX_DECIMALS, false, fromOwner)
      )
    })

    it('reverts when trying to allow a token with invalid decimals', async function() {
      await assertRevert(
        landAuction.allowToken(daiToken.address, 0, false, fromOwner)
      )

      await assertRevert(
        landAuction.allowToken(
          daiToken.address,
          MAX_DECIMALS + 1,
          false,
          fromOwner
        )
      )
    })

    it('reverts when no-owner try to change it', async function() {
      const erc20 = await ERC20Token.new(creationParams)
      await assertRevert(
        landAuction.allowToken(erc20.address, MAX_DECIMALS, false, fromHacker)
      )
    })
  })

  describe('disableToken', function() {
    it('should disableToken', async function() {
      const erc20 = await ERC20Token.new(creationParams)

      await landAuction.allowToken(
        erc20.address,
        MAX_DECIMALS,
        false,
        fromOwner
      )
      let isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(true)

      const { logs } = await landAuction.disableToken(erc20.address, fromOwner)

      assertEvent(logs[0], 'TokenDisabled', {
        _caller: owner,
        _address: erc20.address
      })

      isAllowed = (await landAuction.tokensAllowed(erc20.address))[2]
      isAllowed.should.be.equal(false)
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

  describe('setConvertionFee', function() {
    it('should change convertion fee', async function() {
      let convertionFee = await landAuction.convertionFee()
      convertionFee.should.be.bignumber.equal(CONVERTION_FEE)

      const { logs } = await landAuction.setConvertionFee(110, fromOwner)
      assertEvent(
        normalizeEvent(logs[0]),
        'ConvertionFeeChanged',
        {
          _caller: owner,
          _oldConvertionFee: CONVERTION_FEE.toString(),
          _convertionFee: '110'
        },
        true
      )

      convertionFee = await landAuction.convertionFee()
      convertionFee.should.be.bignumber.equal(110)

      await landAuction.setConvertionFee(100, fromOwner)

      convertionFee = await landAuction.convertionFee()
      convertionFee.should.be.bignumber.equal(100)
    })

    it('reverts when changing to less than 100', async function() {
      await assertRevert(landAuction.setConvertionFee(99, fromOwner))
    })

    it('reverts when changing to > 199', async function() {
      await assertRevert(landAuction.setConvertionFee(200, fromOwner))
    })

    it('reverts when no-owner trying to change it', async function() {
      await assertRevert(landAuction.setConvertionFee(110, fromHacker))
    })
  })
})
