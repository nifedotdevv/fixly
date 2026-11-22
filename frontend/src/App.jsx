import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { ToastProvider } from './components/ui/index.js'
import AuthProvider from './auth/AuthProvider.jsx'
import { queryClient } from './lib/queryClient.js'
import AppRoutes from './router.jsx'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
