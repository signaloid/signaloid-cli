src/bin/init/
├── demo.ts # The main orchestrator for creating a demo
├── customize.ts # Handles post-clone customization (package.json, .git)
├── prompts/
│ ├── applications.ts # Prompts for application details
│ └── inputs.ts # Prompts for interactive slider inputs
└── file-generators/
├── applications.ts # Generates the content for demo.applications.ts.ejs
└── inputs.ts # Generates the content for inputs.ts
