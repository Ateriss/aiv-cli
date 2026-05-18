#!/usr/bin/env node
import { Command } from 'commander';
import { initLang } from './i18n';
import { printBanner } from './cli/banner';
import { initCommand } from './cli/commands/init';
import { prsCommand } from './cli/commands/prs';
import { reviewCommand } from './cli/commands/review';
import { contextCommand } from './cli/commands/context';
import { configCommand } from './cli/commands/config';
import { agentsCommand } from './cli/commands/agents';
import { checkCommand } from './cli/commands/check';

initLang();
printBanner();

const program = new Command();

program
  .name('aiv')
  .description('AI-powered PR reviewer — local-first, multi-agent semantic analysis')
  .version('0.1.0');

program.addCommand(initCommand());
program.addCommand(prsCommand());
program.addCommand(reviewCommand());
program.addCommand(contextCommand());
program.addCommand(configCommand());
program.addCommand(agentsCommand());
program.addCommand(checkCommand());

program.parse(process.argv);
