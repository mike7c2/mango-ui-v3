import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import useMangoGroupConfig from '../hooks/useMangoGroupConfig'
import useMangoStore, { serumProgramId } from '../stores/useMangoStore'
import {
  getMarketByBaseSymbolAndKind,
  getMarketIndexBySymbol,
} from '@blockworks-foundation/mango-client'
import TopBar from '../components/TopBar'
import TradePageGrid from '../components/TradePageGrid'
import useLocalStorageState from '../hooks/useLocalStorageState'
import AlphaModal, { ALPHA_MODAL_KEY } from '../components/AlphaModal'
import { PageBodyWrapper } from '../components/styles'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import IntroTips, { SHOW_TOUR_KEY } from '../components/IntroTips'
import { useViewport } from '../hooks/useViewport'
import { breakpoints } from '../components/TradePageGrid'
import {
  actionsSelector,
  mangoAccountSelector,
  marketConfigSelector,
  walletConnectedSelector,
} from '../stores/selectors'
import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import FavoritesShortcutBar from '../components/FavoritesShortcutBar'
import {
  RoundTable,
  initRoundTable
} from "round-table"

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        'common',
        'tv-chart',
        'alerts',
      ])),
      // Will be passed to the page component as props
    },
  }
}

let roundTableInitialising = false;
let roundTable: RoundTable | null = null;
let connection: Connection | null;

const ChatComponent: React.FC = () => {
  function handleTextEnter(event: any) {
    const trollEntry: any = document.getElementById('searchTxt');
    if (trollEntry) {
        if (event.key === "Enter") {
            console.log("Got event");
            if (roundTable) {
                roundTable.chatManager.sendChatMessage(trollEntry.value);
                trollEntry.value = ""
            }
        }
    }
  }
  const [chat, setChat] = useState([]);

  if ( !connection ) {
    connection = new Connection("https://api.devnet.solana.com")
    console.log("Initialised connection")
  }

  if ( connection && !roundTable && !roundTableInitialising) {
    console.log("Starting to initialise")
    roundTableInitialising = true;

    const id = new Keypair();
    if ( connection ) {
      console.log("Initialising round table")
      initRoundTable(connection, id.publicKey, id, new PublicKey("69GoySbK6vc9QyWsCYTMUjpQXCocbDJansszPTEaEtMp"), "round-table").then((round) =>     {
          roundTable = round;
          console.log("Round table initialised")
          roundTable.addChatListener((msg) => {
            console.log("Incoming chat message")
            chat.push(msg)
            setChat(chat)
          });
      })
    }
  }

  return (
      <div className="chat">
        <div className="bordered">
            <h1>RoundTable Chat</h1>
            <ul className="no-bullets">
                {chat.map((item, index) => (
                    <li key={index}><b>{item.time}</b>:<i>{item.user.toString().slice(0, 6)}</i>:&emsp;{item.msg}</li>
                ))}
            </ul>
            <input name="searchTxt" className="wide" type="text" id="searchTxt" onKeyUp={handleTextEnter} />
        </div>
      </div>
  );
}

const PerpMarket: React.FC = () => {
  const [alphaAccepted] = useLocalStorageState(ALPHA_MODAL_KEY, false)
  const [showTour] = useLocalStorageState(SHOW_TOUR_KEY, false)
  const groupConfig = useMangoGroupConfig()
  const setMangoStore = useMangoStore((s) => s.set)
  const connected = useMangoStore(walletConnectedSelector)
  const mangoAccount = useMangoStore(mangoAccountSelector)
  const mangoGroup = useMangoStore((s) => s.selectedMangoGroup.current)
  const marketConfig = useMangoStore(marketConfigSelector)
  const actions = useMangoStore(actionsSelector)
  const router = useRouter()
  const { pubkey } = router.query
  const { width } = useViewport()
  const hideTips = width ? width < breakpoints.md : false

  // Initialisation in parent component (should be a in a react component)

  useEffect(() => {
    async function loadUnownedMangoAccount() {
      try {
        const unownedMangoAccountPubkey = new PublicKey(pubkey)
        const mangoClient = useMangoStore.getState().connection.client
        if (mangoGroup) {
          const unOwnedMangoAccount = await mangoClient.getMangoAccount(
            unownedMangoAccountPubkey,
            serumProgramId
          )
          console.log('unOwnedMangoAccount: ', unOwnedMangoAccount)

          setMangoStore((state) => {
            state.selectedMangoAccount.current = unOwnedMangoAccount
            state.selectedMangoAccount.initialLoad = false
            state.wallet.connected = true
          })
          actions.fetchTradeHistory()
          actions.reloadOrders()
          // setResetOnLeave(true)
        }
      } catch (error) {
        router.push('/account')
      }
    }

    if (pubkey) {
      loadUnownedMangoAccount()
    }
  }, [pubkey, mangoGroup])

  useEffect(() => {
    const name = decodeURIComponent(router.asPath).split('name=')[1]
    const mangoGroup = useMangoStore.getState().selectedMangoGroup.current

    let marketQueryParam, marketBaseSymbol, marketType, newMarket, marketIndex
    if (name) {
      marketQueryParam = name.toString().split(/-|\//)
      marketBaseSymbol = marketQueryParam[0]
      marketType = marketQueryParam[1].includes('PERP') ? 'perp' : 'spot'

      newMarket = getMarketByBaseSymbolAndKind(
        groupConfig,
        marketBaseSymbol.toUpperCase(),
        marketType
      )
      marketIndex = getMarketIndexBySymbol(
        groupConfig,
        marketBaseSymbol.toUpperCase()
      )

      if (!newMarket?.baseSymbol) {
        router.push('/')
        return
      }
    }

    if (newMarket?.name === marketConfig?.name) return

    if (name && mangoGroup) {
      const mangoCache = useMangoStore.getState().selectedMangoGroup.cache
      setMangoStore((state) => {
        state.selectedMarket.kind = marketType
        if (newMarket.name !== marketConfig.name) {
          // state.selectedMarket.current = null
          state.selectedMarket.config = newMarket
          state.tradeForm.price =
            state.tradeForm.tradeType === 'Limit'
              ? parseFloat(
                  mangoGroup.getPrice(marketIndex, mangoCache).toFixed(2)
                )
              : ''
        }
      })
    } else if (name && marketConfig) {
      // if mangoGroup hasn't loaded yet, set the marketConfig to the query param if different
      if (newMarket.name !== marketConfig.name) {
        setMangoStore((state) => {
          state.selectedMarket.kind = marketType
          state.selectedMarket.config = newMarket
        })
      }
    }
  }, [router, marketConfig])

  return (
    <>
      <div className={`bg-th-bkg-1 text-th-fgd-1 transition-all`}>
        {showTour && !hideTips ? (
          <IntroTips connected={connected} mangoAccount={mangoAccount} />
        ) : null}
        <TopBar />
        <FavoritesShortcutBar />
        <PageBodyWrapper className="p-1 sm:px-2 sm:py-1 md:px-2 md:py-1 xl:px-4">
          <TradePageGrid />
        </PageBodyWrapper>
        {!alphaAccepted && (
          <AlphaModal isOpen={!alphaAccepted} onClose={() => {}} />
        )}
        <ChatComponent />
      </div>
    </>
  )
}

export default PerpMarket
