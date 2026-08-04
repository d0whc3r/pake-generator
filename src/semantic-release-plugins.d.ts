declare module '@semantic-release/commit-analyzer' {
  import { type AnalyzeCommitsContext, type ReleaseType } from 'semantic-release'
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: AnalyzeCommitsContext,
  ): Promise<ReleaseType | null>
}

declare module '@semantic-release/release-notes-generator' {
  import { type GenerateNotesContext } from 'semantic-release'
  export function generateNotes(
    pluginConfig: Record<string, unknown>,
    context: GenerateNotesContext,
  ): Promise<string>
}

declare module '@semantic-release/github' {
  import { type PublishContext, type VerifyConditionsContext } from 'semantic-release'
  export interface GitHubAsset {
    label?: string
    path: string
  }
  export interface GitHubPluginConfig {
    assets?: (string | GitHubAsset)[]
    failComment?: boolean | string
    [option: string]: unknown
  }
  export function publish(
    pluginConfig: GitHubPluginConfig,
    context: PublishContext,
  ): Promise<unknown>
  export function verifyConditions(
    pluginConfig: GitHubPluginConfig,
    context: VerifyConditionsContext,
  ): Promise<void>
}
