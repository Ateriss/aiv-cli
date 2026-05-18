import { Command } from 'commander';
import chalk from 'chalk';
import { table } from 'table';
import { t } from '../../i18n';

export function agentsCommand(): Command {
  return new Command('agents')
    .alias('a')
    .description('List available AI review agents')
    .action(() => {
      const tr = t();
      const agents = [
        { name: 'business',     desc: tr.agentBusinessDesc, focus: tr.agentBusinessFocus },
        { name: 'architecture', desc: tr.agentArchDesc,     focus: tr.agentArchFocus },
        { name: 'security',     desc: tr.agentSecDesc,      focus: tr.agentSecFocus },
      ];

      console.log(chalk.bold(tr.agentsTitle));

      const rows = agents.map(a => [
        chalk.cyan(a.name),
        a.desc,
        chalk.dim(a.focus),
      ]);

      const header = [
        chalk.bold(tr.agentsColAgent),
        chalk.bold(tr.agentsColDesc),
        chalk.bold(tr.agentsColFocus),
      ];

      console.log(table([header, ...rows], {
        border: {
          topBody: '─', topJoin: '┬', topLeft: '╭', topRight: '╮',
          bottomBody: '─', bottomJoin: '┴', bottomLeft: '╰', bottomRight: '╯',
          bodyLeft: '│', bodyRight: '│', bodyJoin: '│',
          joinBody: '─', joinLeft: '├', joinRight: '┤', joinJoin: '┼',
        },
        columns: [
          { width: 14 },
          { width: 44, wrapWord: true },
          { width: 52, wrapWord: true },
        ],
        columnDefault: { paddingLeft: 1, paddingRight: 1 },
      }));

      console.log(chalk.dim(`  ${tr.agentsFooter}\n`));
    });
}
