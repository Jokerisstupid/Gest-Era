import { lazy, Suspense, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import Shell from './features/Shell';
import NotebookLibrary from './features/NotebookLibrary';
import Settings from './features/Settings';
import Onboarding from './features/Onboarding';
import { ToastProvider } from './ui/common';
import { useSettings } from './store/settings';
import './styles.css';
import './gesture-styles.css';
import './notebook-styles.css';
import './editor.css';
const Board = lazy(() => import('./features/Board'));
class ErrorBoundary extends Component<{
    children: ReactNode;
}, {
    failed: boolean;
}> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: Error, info: ErrorInfo) { console.error('GestEra UI error', error, info.componentStack); }
    render() { if (this.state.failed)
        return <div className="board-loading"><h1>Let’s get you back to your ideas.</h1><p>The workspace hit an unexpected error. Your saved boards are still on this device.</p><button className="btn primary" onClick={() => window.location.assign('/app')}>Reload workspace</button></div>; return this.props.children; }
}
function App() { const settings = useSettings(); useEffect(() => { document.documentElement.classList.toggle('reduce-motion', settings.reducedMotion); document.documentElement.classList.toggle('high-contrast', settings.highContrast); }, [settings.reducedMotion, settings.highContrast]); return <ErrorBoundary><ToastProvider><BrowserRouter><Suspense fallback={<div className="board-loading"><LoaderCircle className="spin" size={26}/><p>Opening your workspace…</p></div>}><Routes><Route element={<Shell />}><Route path="/" element={<Navigate to="/app" replace/>}/><Route path="/app" element={<NotebookLibrary />}/><Route path="/notebooks" element={<NotebookLibrary />}/><Route path="/projects" element={<NotebookLibrary />}/><Route path="/favorites" element={<NotebookLibrary />}/><Route path="/settings" element={<Settings />}/><Route path="/onboarding" element={<Onboarding />}/></Route><Route path="/board/:id" element={<Board />}/><Route path="*" element={<Navigate to="/app" replace/>}/></Routes></Suspense></BrowserRouter></ToastProvider></ErrorBoundary>; }
createRoot(document.getElementById('root')!).render(<App />);
