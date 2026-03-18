import { createMemo } from "solid-js";

// Importe seus ícones da pasta de assets
import mdIcon from "../../assets/md.png";
import cSharpIcon from "../../assets/cs.png";
import cppIcon from "../../assets/cpp.png";
import rIcon from "../../assets/r.png";
import bIcon from "../../assets/b.png";
import asmIcon from "../../assets/asm.png";
import aspIcon from "../../assets/asp.png";
import batIcon from "../../assets/bat.png";
import elixirIcon from "../../assets/elixir.png";
import lispIcon from "../../assets/lisp.png";
import pearlIcon from "../../assets/pearl.png";
import imageIcon from "../../assets/image.png";
import fontIcon from "../../assets/font.png";
import pdfIcon from "../../assets/pdf.png";
import svgIcon from "../../assets/svg.png";
import jsIcon from "../../assets/js.png";
import tsIcon from "../../assets/ts.png";
import reactIcon from "../../assets/react.png";
import cssIcon from "../../assets/css.png";
import scssIcon from "../../assets/sass.png";
import lessIcon from "../../assets/less.png";
import htmlIcon from "../../assets/html-5.png";
import jsonIcon from "../../assets/json.png";
import xmlIcon from "../../assets/xml.png";
import rustIcon from "../../assets/rust.png";
import gitIcon from "../../assets/bash.png";
import swiftIcon from "../../assets/swift.png";
import flutterIcon from "../../assets/flutter.png";
import goIcon from "../../assets/golang.png";
import godotIcon from "../../assets/godot.png";
import graphqlIcon from "../../assets/graphql.png";
import makefileIcon from "../../assets/makefile.png";
import pythonIcon from "../../assets/python.png";
import rubyIcon from "../../assets/ruby.png";
import javaIcon from "../../assets/java.png";
import kotlinIcon from "../../assets/kotlin.png";
import phpIcon from "../../assets/php.png";
import vueIcon from "../../assets/vue.png";
import vimIcon from "../../assets/vim.png";
import svelteIcon from "../../assets/svelte.png";
import astroIcon from "../../assets/astro.png";
import luaIcon from "../../assets/lua.png";
import juliaIcon from "../../assets/julia.png";
import delphiIcon from "../../assets/delphi.png";
import pascalIcon from "../../assets/pascal.png";
import dllIcon from "../../assets/dll.png";
import rpgMakerIcon from "../../assets/rpg_maker.png";
import androidIcon from "../../assets/android.png";
import dockerIcon from "../../assets/docker.png";
import blenderIcon from "../../assets/blender.png";
import excelIcon from "../../assets/excel.png";
import databaseIcon from "../../assets/database.png";
import configIcon from "../../assets/config.png";
import packageIcon from "../../assets/package.png";
import defaultIcon from "../../assets/file.png";

type FileIconProps = {
  fileName: string;
  size?: number;
  class?: string;
};

export default function FileIcon(props: FileIconProps) {
  const iconSrc = createMemo(() => {
    const name = props.fileName.toLowerCase();
    const ext = name.split('.').pop();

    // Checagem por nome exato
    if (name === 'dockerfile') return dockerIcon;
    if (name === 'makefile') return makefileIcon;
    if (name === '.gitignore') return gitIcon;
    if (name === 'license') return mdIcon;
    if (name.includes('package.json')) return packageIcon;
    if (name.includes('package-lock.json')) return packageIcon;

    const mapping: Record<string, string> = {
      js: jsIcon,
      mjs: jsIcon,
      ts: tsIcon,
      tsx: reactIcon,
      jsx: reactIcon,
      rs: rustIcon,
      json: jsonIcon,
      arb: jsonIcon,
      xml: xmlIcon,
      css: cssIcon,
      scss: scssIcon,
      less: lessIcon,
      html: htmlIcon,
      htm: htmlIcon,
      htmlx: htmlIcon,
      png: imageIcon,
      jpg: imageIcon,
      jpeg: imageIcon,
      gif: imageIcon,
      ico: imageIcon,
      svg: svgIcon,
      cs: cSharpIcon,
      cshtml: cSharpIcon,
      sln: cSharpIcon,
      csproj: cSharpIcon,
      asp: aspIcon,
      razor: aspIcon,
      resx: aspIcon,
      asa: configIcon,
      r: rIcon,
      b: bIcon,
      asm: asmIcon,
      elixir: elixirIcon,
      ex: elixirIcon,
      exs: elixirIcon,
      heex: elixirIcon,
      pl: pearlIcon,
      pm: pearlIcon,
      p6: pearlIcon,
      pl6: pearlIcon,
      bat: batIcon,
      lisp: lispIcon,
      el: lispIcon,
      php: phpIcon,
      md: mdIcon,
      bash: gitIcon,
      gitignore: gitIcon,
      zsh: gitIcon,
      sh: gitIcon,
      editorconfig: gitIcon,
      go: goIcon,
      mod: goIcon,
      sum: goIcon,
      gd: godotIcon,
      tscn: godotIcon,
      graphql: graphqlIcon,
      graphqls: graphqlIcon,
      makefile: makefileIcon,
      py: pythonIcon,
      rb: rubyIcon,
      java: javaIcon,
      jar: javaIcon,
      gradle: javaIcon,
      jsp: javaIcon,
      vue: vueIcon,
      svelte: svelteIcon,
      astro: astroIcon,
      swift: swiftIcon,
      flutter: flutterIcon,
      dart: flutterIcon,
      kt: kotlinIcon,
      kts: kotlinIcon,
      vim: vimIcon,
      vimrc: vimIcon,
      cpp: cppIcon,
      h: cppIcon,
      c: cppIcon,
      hpp: cppIcon,
      hxx: cppIcon,
      hh: cppIcon,
      cc: cppIcon,
      cxx: cppIcon,
      inl: cppIcon,
      lua: luaIcon,
      julia: juliaIcon,
      dockerfile: dockerIcon,
      toml: packageIcon,
      sql: databaseIcon,
      db: databaseIcon,
      sqlite: databaseIcon,
      sqlite3: databaseIcon,
      blender: blenderIcon,
      glb: blenderIcon,
      yaml: packageIcon,
      yml: packageIcon,
      lock: packageIcon,
      pdf: pdfIcon,
      ttf: fontIcon,
      otf: fontIcon,
      woff: fontIcon,
      woff2: fontIcon,
      dll: dllIcon,
      dts: dllIcon,
      delphi: delphiIcon,
      dpr: delphiIcon,
      dproj: delphiIcon,
      dpk: packageIcon,
      pascal: pascalIcon,
      pas: pascalIcon,
      apk: androidIcon,
      rpgmaker: rpgMakerIcon,
      rvdata2: databaseIcon,
      rxdata: databaseIcon,
      rpgproject: rpgMakerIcon,
      rmpro: rpgMakerIcon,
      xlsx: excelIcon,
      xls: excelIcon,
      zip: packageIcon,
      rar: packageIcon,
      config: configIcon
    };

    return mapping[ext!] || defaultIcon;
  });

  return (
    <img 
      src={iconSrc()} 
      alt="file icon"
      class={props.class}
      style={{ 
        width: props.size ? `${props.size}px` : '16px', 
        height: props.size ? `${props.size}px` : '16px',
        "object-fit": "contain"
      }}
    />
  );
}