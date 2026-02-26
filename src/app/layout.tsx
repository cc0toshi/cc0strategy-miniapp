import type { Metadata, Viewport } from 'next';
import { Space_Mono } from 'next/font/google';
import Link from 'next/link';
import { Providers } from '@/lib/Providers';
import './globals.css';

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  other: {
    'base:app_id': '69a0701e8c54300740ae2074',
  },
  title: 'cc0strategy',
  description: 'Token launchpad where 6.9% of trading fees go to NFT holders. Built on Uniswap V4.',
  openGraph: {
    title: 'cc0strategy',
    description: 'Token launchpad where 6.9% of trading fees go to NFT holders',
    url: 'https://miniapp.cc0strategy.fun',
    siteName: 'cc0strategy',
    images: [
      {
        url: 'https://miniapp.cc0strategy.fun/og-image.png',
        width: 1200,
        height: 630,
        alt: 'cc0strategy - NFT-powered token launchpad',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'cc0strategy',
    description: 'Token launchpad where 6.9% of trading fees go to NFT holders',
    images: ['https://miniapp.cc0strategy.fun/og-image.png'],
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceMono.variable}>
      <body className="bg-black text-white antialiased">
        <Providers>
          <div className="min-h-screen flex flex-col">
            {/* Top Navigation */}
            <nav className="border-b-2 border-white">
              <div className="px-4">
                <div className="flex items-center justify-between h-14">
                  <Link href="/" className="font-editorial text-lg font-bold tracking-tight hover:opacity-60 transition-opacity">CC0STRATEGY</Link>
                  <div className="flex items-center gap-2">
                    <Link href="/swap" className="font-editorial text-xs uppercase tracking-widest border border-white px-3 py-1.5 hover:bg-white hover:text-black transition-colors">Trade</Link>
                    <Link href="/portfolio" className="hover:opacity-60 transition-opacity p-1" title="Portfolio">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    </Link>
                    <details className="relative">
                      <summary className="list-none cursor-pointer p-1 hover:opacity-60">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                      </summary>
                      <div className="absolute right-0 top-full mt-2 w-48 bg-black border-2 border-white z-50">
                        <Link href="/browse" className="block px-4 py-3 text-sm uppercase tracking-wider border-b border-neutral-800 hover:bg-white hover:text-black transition-colors">Browse</Link>
                        <Link href="/swap" className="block px-4 py-3 text-sm uppercase tracking-wider border-b border-neutral-800 hover:bg-white hover:text-black transition-colors">Trade</Link>
                        <Link href="/claim" className="block px-4 py-3 text-sm uppercase tracking-wider border-b border-neutral-800 hover:bg-white hover:text-black transition-colors">Claim</Link>
                        <Link href="/portfolio" className="block px-4 py-3 text-sm uppercase tracking-wider border-b border-neutral-800 hover:bg-white hover:text-black transition-colors">Portfolio</Link>
                        <Link href="/deploy" className="block px-4 py-3 text-sm uppercase tracking-wider border-b border-neutral-800 hover:bg-white hover:text-black transition-colors">Deploy</Link>
                        <Link href="/docs" className="block px-4 py-3 text-sm uppercase tracking-wider text-neutral-500 hover:bg-white hover:text-black transition-colors">Docs</Link>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </nav>

            {/* Main Content */}
            <main className="flex-1 pb-20">{children}</main>

            {/* Bottom Navigation - Icons only, no labels */}
            <nav className="fixed bottom-0 left-0 right-0 bg-black border-t-2 border-white safe-area-bottom z-50">
              <div className="flex justify-around items-center h-14 px-4">
                <NavItem href="/" icon="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                <NavItem href="/browse" icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                <NavItem href="/swap" icon="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                <NavItem href="/claim" icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <NavItem href="/portfolio" icon="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </div>
            </nav>
          </div>
        </Providers>
      </body>
    </html>
  );
}

function NavItem({ href, icon }: { href: string; icon: string }) {
  return (
    <Link href={href} className="flex items-center justify-center p-3 text-neutral-400 hover:text-white transition-colors">
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
    </Link>
  );
}
