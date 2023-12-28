/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */


import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { Lifecycle, Messages, SandboxEvents, SandboxProcessObject, SfError, StatusEvent } from '@salesforce/core';
import { assert, expect, config } from 'chai';
import { OrgOpenOutput } from '../../../src/commands/org/open.js';

config.truncateThreshold = 0;
Messages.importMessagesDirectoryFromMetaUrl(import.meta.url)
const messages = Messages.loadMessages('@salesforce/plugin-org', 'create');

describe('Sandbox Orgs via legacy org:create', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({
      project: { name: 'sandboxCreateLegacy' },
      devhubAuthStrategy: 'AUTO',
    });
  });

  it('will create a sandbox, verify it can be opened, and then attempt to delete it', () => {
    let result: SandboxProcessObject | undefined;
    try {
      Lifecycle.getInstance().on(SandboxEvents.EVENT_STATUS, async (results: StatusEvent) =>
        // eslint-disable-next-line no-console
        Promise.resolve(console.log('sandbox copy progress', results.sandboxProcessObj.CopyProgress))
      );
      result = execCmd<SandboxProcessObject>(
        // escaped, pending outcome W-12683861
        // eslint-disable-next-line sf-plugin/no-execcmd-double-quotes
        `force:org:create -a mySandbox -t sandbox -s licenseType="Developer" -w 60 -u ${session.hubOrg.username} --json`,
        { timeout: 3_600_000, ensureExitCode: 0 }
      ).jsonOutput?.result;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(e);
      assert(e instanceof SfError);
      // there was a DNS issue, verify we handled it as best as we could
      expect(e.exitCode, 'org:create DNS issue').to.equal(68);
      // it'll be one of the CLIs
      try {
        expect(e.message, 'org:create DNS issue').to.include(messages.getMessage('partialSuccess', ['sf', 'sf', 'sf']));
        expect(e.message, 'org:create DNS issue').to.include(messages.getMessage('dnsTimeout', ['sf', 'sf']));
      } catch {
        expect(e.message, 'org:create DNS issue').to.include(
          messages.getMessage('partialSuccess', ['sfdx', 'sfdx', 'sfdx'])
        );
        expect(e.message, 'org:create DNS issue').to.include(messages.getMessage('dnsTimeout', ['sfdx', 'sfdx']));
      }
    }
    assert(result, JSON.stringify(result));
    // autogenerated sandbox names start with 'sbx'
    expect(result.CopyProgress).to.equal(100);
    expect(result.SandboxName.startsWith('sbx')).to.be.true;
    const sandboxUsername = `${session.hubOrg.username}.${result.SandboxName}`;
    // even if a DNS issue occurred, the sandbox should still be present and available.
    const openResult = execCmd<{ username: string }>('force:org:open -u mySandbox --urlonly --json', {
      ensureExitCode: 0,
    }).jsonOutput?.result;
    assert(openResult, 'org:open');
    expect(openResult.username, 'org:open').to.equal(sandboxUsername);

    const deleteResult = execCmd<OrgOpenOutput>('force:org:delete -u mySandbox --noprompt --json', {
      ensureExitCode: 0,
    }).jsonOutput?.result;
    assert(deleteResult, 'org:delete');
    expect(deleteResult.username, 'org:delete').to.equal(sandboxUsername);
  });

  after(async () => {
    try {
      await session?.clean();
    } catch (e) {
      // do nothing, session?.clean() will try to remove files already removed by the org:delete and throw an error
      // it will also unwrap other stubbed methods
    }
  });
});
