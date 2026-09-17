import {FaCompactDisc, FaDownload, FaMinus, FaPlus, FaTimes} from 'react-icons/fa'
import {BsMusicPlayerFill} from 'react-icons/bs'
import {APP_NAME, BASE_PATH, IS_BETA} from "$config"
import {CSSProperties, FC, ReactNode, useEffect, useState} from 'react'
import Link from 'next/link'
import {useTheme} from '$lib/Hooks/useTheme'
import {MenuButton} from '$cmp/shared/Menu/MenuItem'
import {KeyboardProvider} from '$lib/Providers/KeyboardProvider'
import {AppButton} from '$cmp/shared/Inputs/AppButton'
import {VsrgIcon} from '$cmp/shared/icons/VsrgIcon'
import {VsrgComposerIcon} from '$cmp/shared/icons/VsrgComposerIcon'
import {useObservableObject} from '$lib/Hooks/useObservable'
import {homeStore} from '$stores/HomeStore'
import {useRouter} from 'next/router'
import {clearClientCache, isTWA} from '$lib/utils/Utilities'
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts'
import {MdOutlinePiano} from "react-icons/md";
import {FaFacebook, FaDiscord, FaRobot} from "react-icons/fa";
import {usePathname} from "next/navigation";
import {logger} from "$stores/LoggerStore";
import {Row} from "$cmp/shared/layout/Row";
import {useTranslation} from "react-i18next";
import {DefaultLanguageSelector} from "$cmp/shared/i18n/LanguageSelector";
import {PromotionCard} from "$cmp/pages/Promotion/PromotionCard";
import {pwaStore} from "$stores/PwaStore";
import {usePageVisit} from "$cmp/shared/PageVisit/pageVisit";
import {PagesVersionsKeys} from "$/PagesVersions";



interface HomeProps {
    askForStorage: () => void,
    setDontShowHome: (override: boolean) => void,
    closeWelcomeScreen: () => void,
    hasVisited: boolean,
}

export default function Home({askForStorage, hasVisited, setDontShowHome, closeWelcomeScreen}: HomeProps) {
    const {t, i18n} = useTranslation(['home', 'common'])
    const data = useObservableObject(homeStore.state)
    const [appScale, setAppScale] = useState(100)
    const currentPage = usePathname()
    const [breakpoint, setBreakpoint] = useState(false)
    const [isTwa, setIsTwa] = useState(false)
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const history = useRouter()
    const [theme] = useTheme()
    const {installEvent} = useObservableObject(pwaStore.state)

    async function clearCache() {
        if (!await asyncConfirm(t('cache_reload_warning'))) return
        clearClientCache()
            .then(() => {
                logger.success(t('cache_cleared'))
                setTimeout(() => {
                    window.location.href = BASE_PATH || "/"
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error(t('error_clearing_cache'))
            })
    }

    useEffect(() => {
        const storedFontScale = JSON.parse(localStorage.getItem(APP_NAME + '-font-size') || '100')
        setIsTwa(isTWA())
        if (storedFontScale < 75 || storedFontScale > 125) return setAppScale(100)
        setAppScale(storedFontScale)
    }, [])
    useEffect(() => {
        const html = document.querySelector('html')
        if (!html) return
        localStorage.setItem(APP_NAME + '-font-size', `${appScale}`)
        if (appScale === 100) {
            html.style.removeProperty("font-size")
            return
        }
        html.style.fontSize = `${appScale}%`
    }, [appScale])

    useEffect(() => {

        KeyboardProvider.register("Escape", () => {
            if (homeStore.state.visible) {
                homeStore.close()
            }
        }, {id: "home"})
        setBreakpoint(window.innerWidth > 900)
        return () => {
            KeyboardProvider.unregisterById("home")
        }
    }, [history])
    return <div
        className={`${homeClass} ignore_click_outside column`}
        style={{
            ...!data.visible ? {display: 'none'} : {},
            backgroundColor: theme.get('background').fade(0.1).toString(),
            overflowX: 'hidden'
        }}
    >
        <MenuButton
            className='close-home'
            onClick={homeStore.close}
            ariaLabel={t('close_home_menu')}
        >
            <FaTimes size={25}/>
        </MenuButton>
        <div className='home-padded column'>

            {(breakpoint || !hasVisited) && <div className='home-top'>
                <div className='home-title'>
                    Tyn x {APP_NAME} Music Nightly
                </div>
                <div className='home-top-text'>
                    {t('app_description', {APP_NAME})}
                </div>
            </div>
            }
            <div className='home-content'>
                <MainContentElement
                    pageKey={'composer'}
                    icon={<FaCompactDisc/>}
                    title={t('composer_name')}
                    style={{backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString()}}
                    background={`${BASE_PATH}/manifestData/composer.webp`}
                    href='/composer'
                    isCurrent={currentPage === '/composer'}
                >
                    {t('composer_description')}
                </MainContentElement>
                <MainContentElement
                    pageKey={'player'}
                    icon={<BsMusicPlayerFill/>}
                    title={t('player_name')}
                    style={{backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString()}}
                    background={`${BASE_PATH}/manifestData/player.webp`}
                    href='/'
                    isCurrent={currentPage === '/' || currentPage === '/player'}
                >
                    {t('player_description')}
                </MainContentElement>
            </div>
            <div className='row center middle-size-pages-wrapper' style={{justifyContent: 'center', gap: '1rem'}}>
                
                <a
                    href='https://www.facebook.com/Tynnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='middle-size-page row'
                >
                    <FaFacebook className='middle-size-page-icon'/>
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        Facebook
                    </span>
                </a>
                
                <a
                    href='https://discord.com/users/1162745976927289454'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='middle-size-page row'
                >
                    <FaDiscord className='middle-size-page-icon'/>
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        Discord
                    </span>
                </a>
                
                <a
                    href='https://www.mediafire.com/file/b7k06ubtyv4j26y/Tyn.exe/file'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='middle-size-page row'
                >
                    <FaRobot className='middle-size-page-icon'/>
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        Tyn Auto Sky
                    </span>
                </a>
            </div>
            <Separator/>
        </div>
        <div className='home-bottom'>
            <Row align={'center'} className='home-app-scaling'>
                <span>
                    {t('scale')}
                </span>
                <AppButton
                    ariaLabel='Decrease app scale'
                    className='flex-centered'
                    onClick={() => {
                        const newScale = appScale - 2
                        if (newScale < 75) return
                        setAppScale(newScale)
                    }}
                >
                    <FaMinus/>
                </AppButton>
                <AppButton
                    className='flex-centered'
                    ariaLabel='Increase app scale'
                    style={{marginRight: '0.5rem'}}
                    onClick={() => {
                        const newScale = appScale + 2
                        if (newScale > 125) return
                        setAppScale(newScale)
                    }}
                >
                    <FaPlus/>
                </AppButton>
                {appScale}%
            </Row>
            <span style={{padding: '0 1rem', textAlign: 'center'}}>
                {t('rights', {company_name: APP_NAME === 'Genshin' ? 'HoYoverse' : 'TGC'})}
            </span>
            <Row gap={'0.5rem'}>
                <div className='home-dont-show-again row-centered' onClick={() => setDontShowHome(!data.canShow)}>
                    <input type='checkbox' checked={!data.canShow} readOnly id='hide-on-open-checkbox'/>
                    <label htmlFor='hide-on-open-checkbox'>
                        {t('hide_on_open')}
                    </label>
                </div>
                <DefaultLanguageSelector/>
            </Row>
        </div>
        {IS_BETA &&
            <div className={'top-right-home-label'}>
                {t('beta')}
            </div>
        }
    </div>
}

interface MiddleSizePageProps {
    children: ReactNode,
    href: string
    current: boolean
    Icon: FC<{ className?: string }>
}

function MiddleSizePage({href, children, Icon, current}: MiddleSizePageProps) {
    return <Link
        href={href}
        onClick={homeStore.close}
        className={`middle-size-page row ${current ? 'current-page' : ''}`}
    >
        <Icon className='middle-size-page-icon'/>
        {children}
    </Link>
}


interface PageRedirectProps {
    pageKey: PagesVersionsKeys
    children: ReactNode,
    current: boolean,
    href: string
}

function PageRedirect({children, current, href, pageKey}: PageRedirectProps) {
    const visited = usePageVisit(pageKey)
    return <Link
        onClick={homeStore.close}
        href={href}
        className={`${visited.className} ${current ? 'current-page' : ''}`}
        style={visited.style}
    >
        {children}
    </Link>
}

interface MainContentElementProps {
    pageKey: PagesVersionsKeys
    title: string,
    icon: ReactNode,
    children: ReactNode,
    background: string,
    isCurrent: boolean,
    href: string,
    style?: CSSProperties

}

function MainContentElement({
                                title,
                                icon,
                                children,
                                background,
                                isCurrent,
                                href,
                                style = {},
                                pageKey
                            }: MainContentElementProps) {
    const {t} = useTranslation('common')
    const visited = usePageVisit(pageKey)
    return <Link
        className={`${visited.className} home-content-element ${isCurrent ? 'current-page' : ''}`}
        href={href}
        style={visited.style}
        onClick={homeStore.close}
    >
        <div className='home-content-background' style={{backgroundImage: `url(${background})`}}>
        </div>
        <div className='home-content-main' style={style}>
            <div className='home-content-title'>
                {icon} {title}
            </div>
            <div className='home-content-text'>
                {children}
            </div>
            <div className='home-content-open'>
                <button>
                    {t('open').toUpperCase()}
                </button>
            </div>
        </div>
    </Link>
}

interface SeparatorProps {
    children?: ReactNode
}

function Separator({children}: SeparatorProps) {
    return <div className='home-separator'>
        {children}
    </div>
}

