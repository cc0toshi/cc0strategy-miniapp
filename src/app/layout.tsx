import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/Providers';
import { BottomNav } from '@/lib/BottomNav';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const miniAppEmbed = {
  version: '1',
  imageUrl: 'https://cc0strategy.fun/og-image.png',
  button: {
    title: 'Trade',
    action: {
      type: 'launch_frame',
      name: 'cc0strategy',
      url: 'https://miniapp.cc0strategy.fun',
      splashImageUrl: 'https://cc0strategy.fun/icon.png',
      splashBackgroundColor: '#000000',
    },
  },
};

export const metadata: Metadata = {
  title: 'cc0strategy',
  description: 'Trade cc0 tokens on Farcaster',
  openGraph: {
    title: 'cc0strategy',
    description: 'Trade cc0 tokens on Farcaster',
    images: ['https://cc0strategy.fun/og-image.png'],
  },
  other: {
    'fc:miniapp': JSON.stringify(miniAppEmbed),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white min-h-screen pb-20">
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
