(async function(){
  const mod = await import('../extension/src/prompts/promptTextBuilders.ts');
  console.log('keys:', Object.keys(mod));
  console.log('has default:', !!mod.default);
  if (mod.default) console.log('default keys:', Object.keys(mod.default));
})();
