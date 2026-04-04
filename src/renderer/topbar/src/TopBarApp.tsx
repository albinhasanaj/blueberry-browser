import React from 'react'
import { BrowserProvider } from './contexts/BrowserContext'
import { TabBar } from './components/TabBar'
import { AddressBar } from './components/AddressBar'

export const TopBarApp: React.FC = () => {
    return (
        <BrowserProvider>
            <div className="flex flex-col bg-background select-none">
                {/* Tab Bar */}
                <div className="w-full h-10 pr-2 flex items-center app-region-drag bg-muted/50 dark:bg-muted/30">
                    <TabBar />
                </div>

                {/* Toolbar */}
                <div className="flex items-center px-2 py-1 gap-2 app-region-drag bg-background shadow-subtle z-10 dark:shadow-none dark:border-b dark:border-border/30">
                    <AddressBar />
                </div>
            </div>
        </BrowserProvider>
    )
}

