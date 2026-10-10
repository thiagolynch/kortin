import { Component } from 'react';

/**
 * Se a interface quebrar, mostra uma tela de recuperação em vez de uma janela em branco.
 * O projeto continua salvo na recuperação automática (gravada antes do erro).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Kortin: erro na interface', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Algo deu errado na tela do Kortin</h1>
        <p>Seu projeto está guardado na recuperação automática. Ao recarregar, o Kortin oferece recuperá-lo.</p>
        <pre className="error-box small">{String(this.state.error?.message || this.state.error)}</pre>
        <button className="btn primary" onClick={() => window.location.reload()}>Recarregar o Kortin</button>
      </div>
    );
  }
}
