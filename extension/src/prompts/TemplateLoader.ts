/**
 * TemplateLoader - Loads, caches, and renders Handlebars templates
 *
 * Loads templates from .orchestra/templates/prompts/ in the workspace.
 * Supports caching for performance, with devMode to bypass cache during development.
 * Registers custom Handlebars helpers (json, if_eq, default) and partials.
 */

import * as fs from "fs";
import * as path from "path";
import Handlebars from "handlebars";

/**
 * Options for TemplateLoader constructor
 */
export interface TemplateLoaderOptions {
  /** Absolute path to the workspace root */
  workspaceRoot: string;
  /** If true, bypass cache and reload templates each render */
  devMode?: boolean;
}

/**
 * TemplateLoader handles loading, caching, and rendering Handlebars templates
 * from the workspace .orchestra/templates/prompts/ directory.
 *
 * @example
 * ```typescript
 * const loader = new TemplateLoader({ workspaceRoot: '/path/to/workspace' });
 * const output = loader.render('handover', { task, sprint });
 * ```
 */
export class TemplateLoader {
  private readonly workspaceRoot: string;
  private readonly devMode: boolean;
  private readonly templateCache: Map<string, HandlebarsTemplateDelegate>;
  private readonly handlebars: typeof Handlebars;
  private partialsRegistered: boolean = false;

  /**
   * Create a new TemplateLoader
   *
   * @param options Configuration options
   * @param options.workspaceRoot Absolute path to workspace root (required)
   * @param options.devMode If true, bypass cache and reload templates each render (optional, default: false)
   */
  constructor(options: TemplateLoaderOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.devMode = options.devMode ?? false;
    this.templateCache = new Map();

    // Create isolated Handlebars instance to avoid polluting global state
    this.handlebars = Handlebars.create();

    // Register custom helpers
    this.registerHelpers();
  }

  /**
   * Render a template with the given context
   *
   * Templates are loaded from .orchestra/templates/prompts/{name}.hbs
   * Results are cached unless devMode is enabled.
   *
   * @param templateName Template name (without .hbs extension)
   * @param context Data context passed to the template
   * @returns Rendered template output
   * @throws Error if template file is not found
   */
  render(templateName: string, context: Record<string, unknown> = {}): string {
    // Register partials on first render (lazy initialization)
    if (!this.partialsRegistered) {
      this.registerPartials();
      this.partialsRegistered = true;
    }

    const template = this.getCompiledTemplate(templateName);
    return template(context);
  }

  /**
   * Clear all cached templates
   *
   * Forces templates to be reloaded on next render.
   * Useful when templates have been modified externally.
   */
  clearCache(): void {
    this.templateCache.clear();
    // Also reset partials registration so they get re-scanned
    this.partialsRegistered = false;
  }

  /**
   * Get the templates directory path
   */
  private getTemplatesDir(): string {
    return path.join(this.workspaceRoot, ".orchestra", "templates", "prompts");
  }

  /**
   * Get the partials directory path
   */
  private getPartialsDir(): string {
    return path.join(this.getTemplatesDir(), "_partials");
  }

  /**
   * Get the full path for a template file
   */
  private getTemplatePath(templateName: string): string {
    return path.join(this.getTemplatesDir(), `${templateName}.hbs`);
  }

  /**
   * Load and compile a template, using cache if available
   */
  private getCompiledTemplate(templateName: string): HandlebarsTemplateDelegate {
    // In devMode, always reload from disk
    if (this.devMode) {
      return this.loadAndCompileTemplate(templateName);
    }

    // Check cache first
    const cached = this.templateCache.get(templateName);
    if (cached) {
      return cached;
    }

    // Load, compile, and cache
    const compiled = this.loadAndCompileTemplate(templateName);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }

  /**
   * Load template file from disk and compile it
   */
  private loadAndCompileTemplate(templateName: string): HandlebarsTemplateDelegate {
    const templatePath = this.getTemplatePath(templateName);

    // Check if template file exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(
        `Template not found: "${templateName}" (expected at ${templatePath})`
      );
    }

    const templateSource = fs.readFileSync(templatePath, "utf-8");
    return this.handlebars.compile(templateSource);
  }

  /**
   * Register custom Handlebars helpers
   *
   * Helpers registered:
   * - json: Serialize value as pretty-printed JSON (2-space indent)
   * - if_eq: Conditional block if two values are strictly equal
   * - default: Return value if not null/undefined, otherwise return default
   */
  private registerHelpers(): void {
    // json helper: JSON.stringify with 2-space indent
    this.handlebars.registerHelper("json", (context: unknown) => {
      return JSON.stringify(context, null, 2);
    });

    // if_eq helper: block conditional on strict equality
    this.handlebars.registerHelper(
      "if_eq",
      function (
        this: unknown,
        a: unknown,
        b: unknown,
        options: Handlebars.HelperOptions
      ) {
        if (a === b) {
          return options.fn(this);
        } else {
          return options.inverse(this);
        }
      }
    );

    // default helper: nullish coalescing
    this.handlebars.registerHelper(
      "default",
      (value: unknown, defaultValue: unknown) => {
        return value ?? defaultValue;
      }
    );
  }

  /**
   * Register partials from _partials directory
   *
   * Scans .orchestra/templates/prompts/_partials for .hbs files
   * and registers them as Handlebars partials by filename (without extension).
   * Handles missing _partials directory gracefully.
   */
  private registerPartials(): void {
    const partialsDir = this.getPartialsDir();

    // Handle missing _partials directory gracefully
    if (!fs.existsSync(partialsDir)) {
      return;
    }

    // Read all .hbs files from partials directory
    const files = fs.readdirSync(partialsDir);

    for (const file of files) {
      // Only process .hbs files
      if (!file.endsWith(".hbs")) {
        continue;
      }

      // Extract partial name (filename without extension)
      const partialName = file.replace(/\.hbs$/, "");
      const partialPath = path.join(partialsDir, file);

      // Read and register partial
      const partialSource = fs.readFileSync(partialPath, "utf-8");
      this.handlebars.registerPartial(partialName, partialSource);
    }
  }
}
