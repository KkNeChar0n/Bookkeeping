import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles/index.css';

// 申请持久化存储，尽量避免 iOS 清理本地数据
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}

// 注册 Service Worker（离线可用，新版本自动更新）
registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
