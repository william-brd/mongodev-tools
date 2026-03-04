# MongoDev Tools

## Overview

MongoDev Tools is a web-based MongoDB development workbench that allows developers to write, save, and execute MongoDB queries and aggregation pipelines. The application provides a code editor with syntax highlighting, result viewing with export capabilities, script management, and execution history tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, bundled using Vite
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (dark mode by default)
- **Code Editor**: react-simple-code-editor with PrismJS for syntax highlighting

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts` with Zod validation
- **Database Access**: Drizzle ORM for PostgreSQL (app data), MongoDB driver for script execution

### Data Storage
- **PostgreSQL**: Stores application data (scripts, executions, users, sessions) via Drizzle ORM
- **MongoDB**: Target database for script execution (connected via `MONGO_URL` environment variable)
- **Schema Location**: `shared/schema.ts` defines all database tables

### Key Design Patterns
- **Shared Types**: The `shared/` directory contains schemas and route definitions used by both frontend and backend
- **Type-Safe API**: Routes are defined with Zod schemas for input validation and response types
- **Script Execution**: MongoDB scripts run in a sandboxed VM context (`server/lib/mongo.ts`)

### Authentication
- **Keycloak via OIDC**: Authentication now uses OpenID Connect endpoints from Keycloak
- **Required env vars**: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `SESSION_SECRET` (optional: `OIDC_CLIENT_SECRET`, `OIDC_CALLBACK_URL`, `OIDC_POST_LOGOUT_REDIRECT_URI`)
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Protected routes**: API CRUD/execute routes now require an authenticated session

## External Dependencies

### Databases
- **PostgreSQL**: Required for application data storage. Connection via `DATABASE_URL` environment variable
- **MongoDB**: Required for script execution. Connection via `MONGO_URL` environment variable

### Third-Party Services
- **Keycloak**: OpenID Connect provider for user authentication

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit`: Database ORM and migration tools
- `mongodb`: MongoDB Node.js driver for script execution
- `express-session` / `connect-pg-simple`: Session management
- `prismjs` / `react-simple-code-editor`: Code editing and syntax highlighting
- `file-saver`: Client-side file export functionality
- `zod`: Runtime type validation for API requests/responses