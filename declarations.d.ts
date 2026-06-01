// Side-effect + module CSS imports (NativeWind global.css + template .module.css)
declare module '*.css';
declare module '*.module.css' {
  const content: { [className: string]: string };
  export default content;
}
