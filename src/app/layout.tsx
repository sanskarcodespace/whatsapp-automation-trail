import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'WhatsApp CRM — Multi-Tenant AI Platform',
  description: 'Manage WhatsApp AI conversations, leads, and appointments across multiple businesses.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgb(24 24 34)',
              color: 'rgb(248 250 252)',
              border: '1px solid rgb(40 40 58)',
              borderRadius: '10px',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: 'white' } },
            error: { iconTheme: { primary: '#ef4444', secondary: 'white' } },
          }}
        />
      </body>
    </html>
  )
}
