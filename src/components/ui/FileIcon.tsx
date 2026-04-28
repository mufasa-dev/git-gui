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
import nodeIcon from "../../assets/node-js.png";
import njkIcon from "../../assets/njk.png";
import reactIcon from "../../assets/react.png";
import cssIcon from "../../assets/css.png";
import scssIcon from "../../assets/sass.png";
import lessIcon from "../../assets/less.png";
import htmlIcon from "../../assets/html-5.png";
import jsonIcon from "../../assets/json.png";
import jasmineIcon from "../../assets/jasmine.png"
import jestIcon from "../../assets/jest.png"
import vitestIcon from "../../assets/vitest.png"
import xmlIcon from "../../assets/xml.png";
import rustIcon from "../../assets/rust.png";
import gitIcon from "../../assets/bash.png";
import swiftIcon from "../../assets/swift.png";
import flutterIcon from "../../assets/flutter.png";
import goIcon from "../../assets/golang.png";
import godotIcon from "../../assets/godot.png";
import tagIcon from "../../assets/tag.png";
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
import coffeeIcon from "../../assets/coffee.png";
import vbsIcon from "../../assets/vbs.png";
import delphiIcon from "../../assets/delphi.png";
import pascalIcon from "../../assets/pascal.png";
import dllIcon from "../../assets/dll.png";
import flashIcon from "../../assets/flash.png";
import rpgMakerIcon from "../../assets/rpg_maker.png";
import androidIcon from "../../assets/android.png";
import dockerIcon from "../../assets/docker.png";
import jenkinsIcon from "../../assets/jenkins.png";
import blenderIcon from "../../assets/blender.png";
import excelIcon from "../../assets/excel.png";
import musicIcon from "../../assets/music.png";
import videoIcon from "../../assets/video.png";
import databaseIcon from "../../assets/database.png";
import configIcon from "../../assets/config.png";
import brIcon from "../../assets/flags/br.png";
import esIcon from "../../assets/flags/es.png";
import enIcon from "../../assets/flags/us.png";
import itIcon from "../../assets/flags/it.png";
import frIcon from "../../assets/flags/fr.png";
import deIcon from "../../assets/flags/de.png";
import seIcon from "../../assets/flags/se.png";
import cnIcon from "../../assets/flags/cn.png";
import jpIcon from "../../assets/flags/jp.png";
import packageIcon from "../../assets/package.png";
import defaultIcon from "../../assets/file.png";
import alertIcon from "../../assets/alert.png";

type FileIconProps = {
  fileName: string;
  size?: number;
  class?: string;
};

export default function FileIcon(props: FileIconProps) {
  const iconSrc = createMemo(() => {
    const name = (props.fileName.split(/[\\/]/).pop() || '').toLowerCase();
    const ext = name.split('.').pop();

    // Checagem por nome exato
    if (name === 'dockerfile') return dockerIcon;
    if (name === 'jenkinsfile') return jenkinsIcon;
    if (name === 'makefile') return makefileIcon;
    if (name === '.gitignore') return gitIcon;
    if (name === 'license') return mdIcon;
    if (name.includes('package.json')) return packageIcon;
    if (name.includes('package-lock.json')) return packageIcon;

    // Ícones de teste
    if (name === 'jasmine') return jasmineIcon;
    if (name === 'jest') return jestIcon;
    if (name === 'vitest') return vitestIcon;
    if (name === 'gotest') return goIcon;
    if (name === 'pytest') return pythonIcon;
    if (name === 'none') return alertIcon;

    // Checagem por arquivos de tradução
    if (['pt.ts', 'pt.json', 'pt-br.ts', 'pt-br.json', 'pt_br.json', 'br.json', 'pt_br.asp'].includes(name.toLowerCase())) return brIcon;
    if (['es.ts', 'es.json', 'es-es.ts', 'es-es.json', 'es_es.json', 'es_es.asp'].includes(name.toLowerCase())) return esIcon;
    if (['en.ts', 'en.json', 'en-us.ts', 'en-us.json', 'en_us.json', 'en_us.asp'].includes(name.toLowerCase())) return enIcon;
    if (['it.ts', 'it.json', 'it-it.ts', 'it-it.json', 'it_it.json', 'it_it.asp'].includes(name.toLowerCase())) return itIcon;
    if (['fr.ts', 'fr.json', 'fr-fr.ts', 'fr-fr.json', 'fr_fr.json', 'fr_fr.asp'].includes(name.toLowerCase())) return frIcon;
    if (['de.ts', 'de.json', 'de-de.ts', 'de-de.json', 'de_de.json', 'de_de.asp'].includes(name.toLowerCase())) return deIcon;
    if (['se.ts', 'se.json', 'se-se.ts', 'se-se.json', 'se_se.json', 'se_se.asp'].includes(name.toLowerCase())) return seIcon;
    if (['cn.ts', 'cn.json', 'cn-cn.ts', 'cn-cn.json', 'cn_cn.json', 'cn_cn.asp'].includes(name.toLowerCase())) return cnIcon;
    if (['jp.ts', 'jp.json', 'jp-jp.ts', 'jp-jp.json', 'jp_jp.json', 'jp_jp.asp'].includes(name.toLowerCase())) return jpIcon;

    const mapping: Record<string, string> = {
      js: jsIcon,
      cjs: jsIcon,
      mjs: jsIcon,
      ts: tsIcon,
      tsx: reactIcon,
      jsx: reactIcon,
      rs: rustIcon,
      json: jsonIcon,
      node: nodeIcon,
      ejs: nodeIcon,
      jade: nodeIcon,
      njk: njkIcon,
      pug: nodeIcon,
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
      bmp: imageIcon,
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
      gitkeep: gitIcon,
      go: goIcon,
      mod: goIcon,
      sum: goIcon,
      godot: godotIcon,
      gd: godotIcon,
      tscn: godotIcon,
      tres: godotIcon,
      uid: tagIcon,
      cfg: configIcon,
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
      vbs: vbsIcon,
      oca: vbsIcon,
      dockerfile: dockerIcon,
      dockerignore: dockerIcon,
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
      coffee: coffeeIcon,
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
      mp3: musicIcon,
      wav: musicIcon,
      flac: musicIcon,
      ogg: musicIcon,
      mp4: videoIcon,
      mkv: videoIcon,
      avi: videoIcon,
      mov: videoIcon,
      wmv: videoIcon,
      swf: flashIcon,
      swc: flashIcon,
      config: configIcon,
      conf: configIcon,
      env: configIcon,
      browserslistrc: configIcon
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