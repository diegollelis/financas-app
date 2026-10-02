import { describe, expect, it } from 'vitest';
import { createWorkspaceInputSchema, hasRole, workspaceSchema } from './workspace.ts';

describe('createWorkspaceInputSchema', () => {
  it('trims the name', () => {
    expect(createWorkspaceInputSchema.parse({ name: '  Casa ' })).toEqual({ name: 'Casa' });
  });

  it.each([
    { label: 'blank name', name: '   ', message: 'Dê um nome ao espaço.' },
    {
      label: 'name over 100 characters',
      name: 'a'.repeat(101),
      message: 'Use no máximo 100 caracteres.',
    },
  ])('rejects $label', ({ name, message }) => {
    expect(createWorkspaceInputSchema.safeParse({ name }).error?.issues[0]?.message).toBe(message);
  });
});

describe('workspaceSchema', () => {
  const workspace = {
    id: '01920000-0000-7000-8000-000000000000',
    name: 'Pessoal',
    isPersonal: true,
    role: 'OWNER',
  };

  it('accepts a workspace with the member role', () => {
    expect(workspaceSchema.parse(workspace)).toEqual(workspace);
  });

  it('rejects an unknown role', () => {
    expect(workspaceSchema.safeParse({ ...workspace, role: 'ADMIN' }).success).toBe(false);
  });
});

describe('hasRole', () => {
  it.each([
    { role: 'OWNER', minimum: 'VIEWER', expected: true },
    { role: 'OWNER', minimum: 'OWNER', expected: true },
    { role: 'EDITOR', minimum: 'VIEWER', expected: true },
    { role: 'EDITOR', minimum: 'EDITOR', expected: true },
    { role: 'EDITOR', minimum: 'OWNER', expected: false },
    { role: 'VIEWER', minimum: 'VIEWER', expected: true },
    { role: 'VIEWER', minimum: 'EDITOR', expected: false },
  ] as const)('$role meets $minimum: $expected', ({ role, minimum, expected }) => {
    expect(hasRole(role, minimum)).toBe(expected);
  });
});
