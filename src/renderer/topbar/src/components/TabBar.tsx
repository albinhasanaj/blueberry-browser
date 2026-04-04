import React from 'react'
import { Plus, X } from 'lucide-react'
import { useBrowser } from '../contexts/BrowserContext'
import { Favicon } from '../components/Favicon'
import { TabBarButton } from '../components/TabBarButton'
import { cn } from '@common/lib/utils'

interface TabItemProps {
    id: string
    title: string
    favicon?: string | null
    isActive: boolean
    isAgentControlled: boolean
    isPinned?: boolean
    onClose: () => void
    onActivate: () => void
}

const TabItem: React.FC<TabItemProps> = ({
    title,
    favicon,
    isActive,
    isAgentControlled,
    isPinned = false,
    onClose,
    onActivate
}) => {
    const baseClassName = cn(
        "relative flex items-center h-7 pl-2.5 pr-1.5 select-none rounded-full",
        "text-primary group/tab transition-all duration-200 cursor-pointer text-[11px]",
        "app-region-no-drag",
        isActive
            ? "bg-background shadow-tab dark:bg-secondary"
            : "bg-transparent hover:bg-muted/50 dark:hover:bg-muted/30",
        isAgentControlled && "ring-1 ring-sky-400/70 ring-inset",
        isPinned ? "w-7 !px-0 justify-center" : ""
    )

    return (
        <div className="py-1 px-0.5">
            <div
                className={baseClassName}
                onClick={() => !isActive && onActivate()}
            >
                {/* Favicon */}
                <div className={cn(!isPinned && "mr-2")}>
                    <Favicon src={favicon} />
                </div>

                {/* Title (hide for pinned tabs) */}
                {!isPinned && (
                    <span className="text-xs truncate max-w-[200px] flex-1">
                        {title || 'New Tab'}
                    </span>
                )}

                {/* Close button (shows on hover) */}
                {!isPinned && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                        }}
                        className={cn(
                            "flex-shrink-0 p-0.5 rounded-full transition-opacity ml-1",
                            "hover:bg-muted dark:hover:bg-muted/50",
                            "opacity-0 group-hover/tab:opacity-100",
                            isActive && "opacity-100"
                        )}
                    >
                        <X className="size-2.5 text-muted-foreground" />
                    </div>
                )}
            </div>
        </div>
    )
}

export const TabBar: React.FC = () => {
    const { tabs, createTab, closeTab, switchTab } = useBrowser()

    const handleCreateTab = () => {
        createTab()
    }

    // Extract favicon from URL (simplified - you might want to improve this)
    const getFavicon = (url: string) => {
        try {
            const domain = new URL(url).hostname
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
        } catch {
            return null
        }
    }

    return (
        <div className="flex-1 overflow-x-hidden flex items-center justify-center">
            {/* macOS traffic lights spacing */}
            <div className="pl-20" />

            {/* Tabs - centered pill container */}
            <div className="flex items-center bg-muted/60 dark:bg-muted/40 rounded-full px-1 py-0.5 gap-0.5">
                {tabs.map(tab => (
                    <TabItem
                        key={tab.id}
                        id={tab.id}
                        title={tab.title}
                        favicon={getFavicon(tab.url)}
                        isActive={tab.isActive}
                        isAgentControlled={tab.isAgentControlled}
                        onClose={() => closeTab(tab.id)}
                        onActivate={() => switchTab(tab.id)}
                    />
                ))}

                {/* Add Tab Button inside pill */}
                <TabBarButton
                    Icon={Plus}
                    onClick={handleCreateTab}
                />
            </div>

            <div className="flex-1" />
        </div>
    )
}
