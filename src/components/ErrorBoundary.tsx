import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
    this.setState({
      errorInfo: errorInfo.componentStack || '',
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: '' });
  };

  handleFullReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          background: 'var(--bg-primary, #0a0a0f)',
          color: 'var(--text-primary, #e4e4e7)',
        }}>
          <div style={{
            textAlign: 'center',
            maxWidth: 480,
            padding: '2.5rem',
            background: 'var(--bg-card, rgba(255,255,255,0.04))',
            borderRadius: 16,
            border: '1px solid var(--border, rgba(255,255,255,0.08))',
          }}>
            <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
            <h2 style={{ fontSize: '1.3rem', marginBottom: 8 }}>Something went wrong</h2>
            <p style={{
              color: 'var(--text-muted, #71717a)',
              fontSize: '0.88rem',
              marginBottom: 24,
              lineHeight: 1.6,
            }}>
              The application encountered an unexpected error. This has been logged for investigation.
            </p>
            {this.state.error && (
              <pre style={{
                textAlign: 'left',
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 8,
                fontSize: '0.75rem',
                color: '#ef4444',
                overflow: 'auto',
                maxHeight: 120,
                marginBottom: 20,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 20px',
                  background: 'var(--accent, #8b5cf6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={15} />
                Try Again
              </button>
              <button
                onClick={this.handleFullReload}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.08)',
                  color: 'var(--text-primary, #e4e4e7)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
