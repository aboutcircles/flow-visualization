# Circles Flow Visualization

A React-based visualization tool for exploring and analyzing transaction paths in the Circles network. This application provides an interactive interface to visualize token transfer paths between addresses and analyze maximum flow capacity.

![Visualization Example 1](img/viz1.png)

## Features

### Core Functionality
- **Interactive Graph Visualization** - Real-time rendering of complex token transfer networks using Cytoscape.js
- **Dynamic Path Finding** - Find optimal transfer paths between addresses with configurable parameters
- **Token Filtering** - Include or exclude specific tokens in path calculations
- **Capacity Analysis** - Visualize and filter transfers based on flow capacity
- **Flow Matrix Parameters** - Generate `operateFlowMatrix` parameters for on-chain execution
- **Profile Integration** - Display human-readable names for addresses and tokens

### Performance Features
- **Adaptive Rendering** - Automatically adjusts visual complexity based on graph size
- **Performance Presets** - Quick switching between quality levels (Fast, Balanced, Quality, Ultra)
- **Progressive Loading** - Lazy loading of profile and balance data
- **Caching System** - In-memory and localStorage caching for API responses
- **Keyboard Shortcuts** - Efficient navigation and control

### Visualization Features
- **Multiple Layout Algorithms** - Klay, Dagre, Hierarchical, Circle, and Concentric layouts
- **Edge Styling** - Capacity gradients, wrapped token indicators, over-capacity highlights
- **Interactive Elements** - Hover tooltips, click-to-select transactions, zoom controls
- **Resizable Panels** - Adjustable interface sections for optimal viewing

## Technology Stack

- **React 18.2** - Frontend framework with hooks and context
- **Cytoscape.js** - Graph visualization library with custom optimizations
- **Tailwind CSS** - Utility-first CSS framework
- **Radix UI** - Accessible, unstyled UI primitives
- **Recharts** - Data visualization for metrics
- **Vite** - Next-generation build tool
- **Circles SDK** - Official SDK for Circles network interaction

## Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager
- Modern web browser with ES6+ support

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd flow-visualization
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in terminal).

## Project Structure

The application follows a modular architecture with clear separation of concerns:

```
src/
├── components/
│   ├── metrics/                     # Modular metrics system
│   │   ├── BaseMetric.js           # Base class for all metrics
│   │   ├── index.js                # Metric registry and helpers
│   │   └── *Metric.jsx             # Individual metric implementations
│   ├── ui/                         # Reusable UI components
│   │   ├── button.jsx              # Button component
│   │   ├── card.jsx                # Card component
│   │   ├── header.jsx              # Application header
│   │   ├── input.jsx               # Input fields
│   │   ├── label.jsx               # Label component
│   │   ├── tabs.jsx                # Tabbed interface
│   │   ├── toggle-switch.jsx       # Toggle switch component
│   │   ├── token-input.jsx         # Multi-token input
│   │   ├── tooltip.jsx             # Hover tooltips
│   │   └── transaction_table.jsx   # Transaction data table
│   ├── CollapsibleLeftPanel.jsx    # Main control panel
│   ├── CytoscapeVisualization.jsx  # Graph rendering component
│   ├── FlowMatrixParams.jsx        # Parameter generation
│   ├── FlowVisualization.jsx       # Main application component
│   ├── GraphControls.jsx           # Graph interaction controls
│   ├── GraphPerformanceControls.jsx # Performance settings
│   ├── PathFinderForm.jsx          # Path finding form
│   ├── PathStats.jsx               # Path statistics display
│   └── PerformanceOverlay.jsx      # FPS/performance monitor
├── config/
│   └── performanceConfig.js        # Performance presets and defaults
├── contexts/
│   └── PerformanceContext.jsx      # Global performance state
├── hooks/
│   ├── useCytoscapeFast.js        # Optimized Cytoscape hook
│   ├── useFormData.js             # Form state management
│   ├── useKeyboardShortcuts.js    # Keyboard shortcut handler
│   ├── usePathData.js             # API data management
│   └── usePerformanceMonitor.js   # Performance tracking
├── lib/
│   ├── graphOptimizer.js          # Graph optimization utilities
│   └── utils.jsx                  # Utility functions
├── services/
│   ├── cacheService.js            # Caching implementation
│   └── circlesApi.js              # API integration layer
├── App.jsx                        # Root application component
├── main.jsx                       # Application entry point
└── index.css                      # Global styles
```

## Architecture Overview

### Component Architecture

The application uses a hierarchical component structure:

1. **FlowVisualization** (Main Container)
   - Manages global state and coordinates sub-components
   - Handles keyboard shortcuts and performance monitoring
   - Controls layout and panel visibility

2. **CollapsibleLeftPanel** (Control Panel)
   - **PathFinderForm** - Input controls for path finding
   - **GraphPerformanceControls** - Performance settings
   - Displays results and errors

3. **CytoscapeVisualization** (Graph Display)
   - Renders the network graph
   - Handles node and edge styling
   - Manages user interactions

4. **Bottom Panel** (Results)
   - **TransactionTable** - Sortable list of transfers
   - **FlowMatrixParams** - Generated parameters
   - **PathStats** - Statistical analysis with visualizations

### State Management

The application uses React hooks and context for state management:

- **PerformanceContext** - Global performance settings and monitoring
- **useFormData** - Form state and validation
- **usePathData** - API data fetching and caching
- **useCytoscapeFast** - Optimized graph rendering

### Performance Optimization

The application implements several performance strategies:

1. **Adaptive Rendering**
   - Automatically switches to fast mode for graphs >500 edges
   - Reduces visual complexity for very large graphs
   - Progressive feature disabling based on graph size

2. **Lazy Loading**
   - Profile data loaded on-demand
   - Balance data fetched only when needed
   - Batch processing for large datasets

3. **Caching Strategy**
   - Two-tier caching (memory + localStorage)
   - TTL-based expiration
   - Automatic cleanup when storage is full

4. **Rendering Optimizations**
   - Viewport culling for off-screen elements
   - Batch DOM updates
   - Debounced event handlers

## API Integration

### Circles Network API

The application connects to the Circles RPC endpoint:
- Default endpoint: `https://rpc.aboutcircles.com/`
- Methods: `circles_findPath`, profile lookups, balance queries

### Path Finding Parameters

```javascript
{
  Source: "0x...",              // Source address
  Sink: "0x...",                // Destination address
  TargetFlow: "1000000...",     // Amount in wei
  FromTokens: ["0x..."],        // Optional: source tokens
  ToTokens: ["0x..."],          // Optional: destination tokens
  ExcludedFromTokens: ["0x..."], // Optional: excluded source tokens
  ExcludedToTokens: ["0x..."],   // Optional: excluded dest tokens
  WithWrap: true                // Include wrapped tokens
}
```

## Metrics System

The application includes a modular metrics system for analyzing paths:

### Available Metrics

1. **Transfer Count** - Total number of transfers
2. **Intermediate Nodes** - Nodes between source and sink
3. **Distinct Tokens** - Unique tokens used
4. **Wrapped Token Usage** - Analysis of wrapped vs regular tokens
5. **Flow Distribution** - Statistical analysis of flow amounts
6. **Bottlenecks** - Transfers using >90% capacity
7. **Token Distribution** - Usage across different tokens
8. **Path Efficiency** - Comparison to optimal path
9. **Average Node Degree** - Network connectivity

### Adding Custom Metrics

Create a new metric by extending the base pattern:

```javascript
// src/components/metrics/MyCustomMetric.jsx
import { Icon } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'myCustomMetric',
  name: 'My Custom Metric',
  icon: Icon,
  description: 'Description of what this measures',
  order: 100, // Display order (lower = first)
  
  calculate: (pathData, tokenOwnerProfiles, nodeProfiles) => {
    // Your calculation logic here
    const value = computeValue(pathData);
    
    return createMetricResult({
      value: value,
      description: 'Detailed description',
      details: additionalData, // Optional
    });
  },
  
  // Optional: Add visualization
  visualize: (pathData, value, details) => {
    return <YourVisualizationComponent data={details} />;
  }
});
```

Then register it in `src/components/metrics/index.js`.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` / `F` | Fit graph to screen |
| `C` | Center graph |
| `1-4` | Switch performance presets |
| `L` | Toggle edge labels |
| `G` | Toggle edge gradients |
| `T` | Toggle tooltips |
| `S` | Toggle sidebar |

## Performance Presets

### Fast (1)
- Minimal visual features
- Best for graphs >500 edges
- Straight edges, no animations

### Balanced (2)
- Essential features only
- Good performance/quality trade-off
- Tooltips enabled

### Quality (3)
- Most visual features enabled
- Gradients and styling
- For graphs <200 edges

### Ultra (4)
- All features enabled
- Curved edges, animations
- Best visual quality

## Development

### Building for Production

```bash
npm run build
```

The build output will be in the `dist/` directory.

### Running the Linter

```bash
npm run lint
```

### Preview Production Build

```bash
npm run preview
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

## Extending the Application

### Adding a New API Parameter

To add a new parameter to the path finding API:

1. **Update Form Data Hook** (`useFormData.js`):
```javascript
const [formData, setFormData] = useState({
  // ... existing fields
  MaxTransfers: 10, // New field
});
```

2. **Update API Service** (`circlesApi.js`):
```javascript
const params = {
  // ... existing params
  MaxTransfers: formData.MaxTransfers,
};
```

3. **Add UI Control** (`PathFinderForm.jsx`):
```jsx
<div>
  <label className="block text-sm font-medium mb-1">
    Max Transfers
  </label>
  <Input
    type="number"
    value={formData.MaxTransfers}
    onChange={(e) => handleInputChange(e)}
    name="MaxTransfers"
  />
</div>
```

### Adding a New Layout Algorithm

1. Install the Cytoscape extension if needed
2. Register it in `useCytoscapeFast.js`
3. Add to layout options in `GraphControls.jsx`
4. Implement layout configuration in the `getLayoutConfig` function

### Customizing Performance Thresholds

Edit `src/config/performanceConfig.js` to adjust when optimizations trigger:

```javascript
thresholds: {
  largeGraphNodeCount: 100,      // When to consider graph "large"
  largeGraphEdgeCount: 200,      // Edge count for "large" graph
  veryLargeGraphEdgeCount: 500,  // Trigger aggressive optimizations
  autoSimplifyNodeCount: 300,    // Auto-switch to fast mode
  autoSimplifyEdgeCount: 500     // Auto-switch to fast mode
}
```

## Troubleshooting

### Performance Issues

1. **Large graphs are slow**: 
   - Press `1` to switch to Fast mode
   - Adjust capacity filter to reduce visible edges
   - Disable features in performance controls

2. **Graph doesn't fit screen**:
   - Press `F` or `0` to fit
   - Use zoom controls or mouse wheel

3. **Labels overlapping**:
   - Try different layout algorithms
   - Zoom in to specific areas
   - Disable edge labels in performance settings


## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.