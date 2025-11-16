# Anno 117: Pax Romana Production Calculator

[![Live Demo](https://img.shields.io/badge/Live-Demo-success?style=for-the-badge)](https://anno-calculator.org/)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/agentquackyt/Anno117Calculator)

> **The free production chain calculator and building planner for Anno 117: Pax Romana**

Plan, optimize, and visualize your entire Roman empire's economy with interactive dependency graphs, precise building calculations, and advanced aqueduct support.

---

## Features

### Interactive Production Chains
- **Visual Dependency Graphs**: See the complete production chain for any good at a glance
- **Drag & Zoom**: Navigate large production networks with right-click drag and mouse wheel zoom
- **Real-time Updates**: Calculations update instantly as you adjust target production rates

### Smart Building Calculator
- **Precise Calculations**: Get exact building counts needed for target production rates
- **Recommended Ratios**: One-click optimal building ratios for balanced production
- **Fractional Buildings**: See decimal precision to understand when you're over/under producing

### Aqueduct Support
- **Aqua Arborica Integration**: Automatically factor in +50% productivity for plantations
- **Field Irrigation Support**: Calculate with +50% productivity bonus for farms
- **Toggle On/Off**: Flexible settings to plan with or without aqueduct bonuses

### Cost Analysis
- **Total Building Costs**: View combined construction costs for entire production chains
- **Maintenance Tracking**: Calculate ongoing maintenance resource requirements
- **Resource Breakdown**: See costs per resource type with visual icons

### User-Friendly Interface
- **Searchable Goods Grid**: Quickly find any product with instant search
- **Icon-Based Navigation**: Beautiful visual interface with all Anno 117 icons
- **Mobile Responsive**: Works seamlessly on desktop, tablet, and mobile devices

---

## Live Demo

**Visit the calculator:** [https://anno-calculator.org/](https://anno-calculator.org/)

No installation required - works directly in your browser!

---

## Screenshots

### Main Interface
Browse all available goods with visual icons and search functionality:
- Grid layout with all Anno 117 products
- Instant search filtering
- One-click access to production chains

### Production Chain View
Complete visualization of production dependencies:
- Interactive dependency graph
- Building count calculations
- Input/output timing
- Fuel and resource requirements

### Settings Panel
Customize calculations to match your playstyle:
- Enable/disable aqueduct bonuses
- Aqua Arborica for plantations
- Field Irrigation for farms

---

## How to Use

### 1. Select a Good
- Browse the grid of available products
- Use the search bar to quickly find specific goods
- Click any icon to load its production chain

### 2. Set Target Production
- Enter your desired output per minute
- Click "Recommended Ratio" for optimal balanced production
- Watch building counts update in real-time

### 3. Analyze the Chain
- View the complete dependency graph
- See all required input buildings
- Check total construction and maintenance costs

### 4. Optimize with Aqueducts
- Open Settings (gear icon)
- Enable aqueduct bonuses
- Toggle Aqua Arborica or Field Irrigation as needed

### 5. Navigate the Graph
- **Right-click + Drag**: Move the graph around
- **Mouse Wheel**: Zoom in/out
- Visual indicators show fuel requirements and aqueduct bonuses

---

## Technical Features

### Built With
- **Pure JavaScript**: No frameworks, fast and lightweight
- **SVG Graphics**: Scalable, crisp visualizations
- **Local Storage**: Settings persist between sessions
- **Responsive CSS**: Mobile-first design approach

### Game Data
- Complete production data for Anno 117: Pax Romana
- Accurate production times and building costs
- All base inputs and intermediate products
- Fuel consumption tracking

(Not fully implemented)


## Production Chains Available

The calculator includes data for major Anno 117 production chains:

**Consumer Goods:**
- Cloth
- Leather
- Porridge
- Sandals
- Togas
- Wine

**And more being added regularly!**

> **Note**: Not all production chains are implemented yet. The calculator is actively being developed with new chains added regularly.

---

## Use Cases

### Empire Planning
- Design efficient production layouts before building
- Calculate exact building requirements for population needs
- Optimize resource allocation across multiple islands

### Resource Management
- Identify bottlenecks in production chains
- Balance input/output ratios
- Minimize waste and overproduction

### Cost Optimization
- Compare construction costs for different approaches
- Plan maintenance resource requirements
- Optimize for limited resources

### Learning Tool
- Understand Anno 117 production mechanics
- Visualize complex production dependencies
- Master optimal building ratios

---

## Development

### Project Structure
```
Calculator/
├── index.html          # Main application page
├── js/
│   └── calculator.js   # Core calculation logic
├── style/
│   └── theme.css      # Visual styling
├── productions/       # Production chain data (JSON)
│   ├── list.json     # Master goods list
│   └── *.json        # Individual production chainchains
├── icons/            # Game asset icons
└── tools/            # Development utilities
```

### Local Development
1. Clone the repository
2. Open `index.html` in a modern browser
3. No build process required!

### Adding New Production Chains
1. Create JSON file in `productions/` directory
2. Define inputs, outputs, times, and costs
3. Add to `productions/list.json`
4. Icons automatically loaded from `icons/` directory

---

## Contributing

Contributions are welcome! Areas for contribution:
- Adding missing production chains
- Improving calculation algorithms
- UI/UX enhancements
- Bug fixes
- Documentation improvements

---

## License

This is a fan-made tool and is not affiliated with Ubisoft or Ubisoft Mainz.

**All Anno 117: Pax Romana trademarks, assets, and game data are property of Ubisoft.**

This calculator is provided free of charge for the Anno community.

---

## Author

**AgentQuack**
- GitHub: [@agentquackyt](https://github.com/agentquackyt)
- Project Repository: [Anno117Mods](https://github.com/agentquackyt/Anno117Calculator)

---

## Support

If you find this calculator helpful:
- Star the repository
- Report bugs or suggest features via GitHub Issues
- Share with the Anno community
- Join the discussion on Discord

---

## Keywords

Anno 117, Anno 117 Pax Romana, production calculator, production chain, building calculator, resource calculator, Anno calculator, Anno tools, production planner, building planner, dependency graph, production optimization, Anno 117 guide, Anno 117 helper, game calculator, strategy tool

---

## Recent Updates

- Interactive production dependency graphs
- Aqueduct bonus calculations
- Visual cost breakdown with icons
- Recommended ratio feature
- Drag and zoom graph navigation
- About modal with feature overview
- Persistent settings with localStorage

---

**[Try it now at anno-calculator.org](https://anno-calculator.org/)**