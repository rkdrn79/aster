import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  SkillFreshnessInstallation,
  SkillFreshnessInventory,
  SkillFreshnessStatus
} from '../../../shared/skill-freshness'
import type { DiscoveredSkill } from '../../../shared/skills'
import {
  getAgentSkillNavInstallStatus,
  getLinearAgentSkillNavInstallStatus
} from './agent-skill-nav-install-status'

function skill(name: string): DiscoveredSkill {
  const directoryPath = path.join('home', 'test', '.agents', 'skills', name)
  return {
    id: name,
    name,
    description: null,
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    rootPath: path.dirname(directoryPath),
    directoryPath,
    skillFilePath: path.join(directoryPath, 'SKILL.md'),
    installed: true,
    updatedAt: null
  }
}

function placement(name: string, status: SkillFreshnessStatus): SkillFreshnessInstallation {
  const unresolvedPath = path.join('home', 'test', '.agents', 'skills', name)
  return {
    id: name,
    name,
    rootId: 'home-agents',
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    unresolvedPath,
    resolvedPath: unresolvedPath,
    physicalIdentity: name,
    topology: 'canonical-copy',
    status,
    currentPackageDigest: 'current',
    lockSource: 'stablyai/orca',
    errorCategory: null
  }
}

function inventory(
  installations: SkillFreshnessInstallation[],
  eligibleUpdateNames: string[] = []
): SkillFreshnessInventory {
  return { schemaVersion: 1, installations, eligibleUpdateNames, scanIssues: [], scannedAt: 1 }
}

describe('getAgentSkillNavInstallStatus', () => {
  it('keeps loading and missing states ahead of freshness', () => {
    expect(
      getAgentSkillNavInstallStatus({
        name: 'aster-linear',
        installed: true,
        loading: true,
        inventory: inventory([placement('aster-linear', 'current')])
      })
    ).toBe('checking')
    expect(
      getAgentSkillNavInstallStatus({
        name: 'aster-linear',
        installed: false,
        loading: false,
        inventory: null
      })
    ).toBe('install')
  })
})

describe('getLinearAgentSkillNavInstallStatus', () => {
  it('reports canonical installs under aster-linear', () => {
    const skills = [skill('aster-linear')]

    expect(
      getLinearAgentSkillNavInstallStatus({
        skills,
        installed: true,
        loading: false,
        inventory: inventory([placement('aster-linear', 'current')])
      })
    ).toBe('up-to-date')
    expect(
      getLinearAgentSkillNavInstallStatus({
        skills,
        installed: true,
        loading: false,
        inventory: inventory([placement('aster-linear', 'outdated')], ['aster-linear'])
      })
    ).toBe('update-available')
  })

  it('reports legacy-only installs under aster-linear-tickets', () => {
    expect(
      getLinearAgentSkillNavInstallStatus({
        skills: [skill('aster-linear-tickets')],
        installed: true,
        loading: false,
        inventory: inventory([placement('aster-linear-tickets', 'current')])
      })
    ).toBe('up-to-date')
  })

  it('prefers canonical freshness when both names are installed', () => {
    expect(
      getLinearAgentSkillNavInstallStatus({
        skills: [skill('aster-linear'), skill('aster-linear-tickets')],
        installed: true,
        loading: false,
        inventory: inventory(
          [placement('aster-linear', 'current'), placement('aster-linear-tickets', 'outdated')],
          ['aster-linear-tickets']
        )
      })
    ).toBe('up-to-date')
  })

  it('falls back to presence-only status when freshness does not apply', () => {
    expect(
      getLinearAgentSkillNavInstallStatus({
        skills: [skill('aster-linear')],
        installed: true,
        loading: false,
        inventory: null
      })
    ).toBe('installed')
  })
})
