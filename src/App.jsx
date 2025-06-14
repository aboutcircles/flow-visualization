import FlowVisualization from './components/FlowVisualization'
import { PerformanceProvider } from './contexts/PerformanceContext'

function App() {
  return (
    <PerformanceProvider>
      <FlowVisualization />
    </PerformanceProvider>
  )
}

export default App