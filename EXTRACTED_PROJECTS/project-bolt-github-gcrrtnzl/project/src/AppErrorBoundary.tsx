import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the boundary privacy-safe: log only locally; never expose session or business data.
    console.error('Aghbari UI boundary:', error.message, info.componentStack);
  }

  private recover = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="auth-shell" role="alert">
        <section className="auth-card">
          <span className="eyebrow">الأغبري</span>
          <h1>حدث خطأ غير متوقع</h1>
          <p>لم يتم فقد بياناتك المعتمدة. أعد تحميل التطبيق لاستعادة الواجهة.</p>
          <button className="checkout" onClick={this.recover}>إعادة تحميل التطبيق</button>
        </section>
      </main>
    );
  }
}
