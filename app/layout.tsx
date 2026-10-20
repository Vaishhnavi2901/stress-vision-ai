import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'KrishiVerse 2.0 | Smart farming for a sustainable future', description: 'An intelligent agricultural companion with CropVision AI, weather, markets, schemes and planning tools.' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html> }
