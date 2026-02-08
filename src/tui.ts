import pc from 'picocolors';

export function showBanner() {
    const cat = `
      /\\_/\\
     ( o.o )
      > ^ <
    `;

    console.log(pc.magenta(cat));
    console.log(` ${pc.bgMagenta(pc.black(' SIMPLE-CLI '))} ${pc.dim('v0.4.0')}\n`);
}
