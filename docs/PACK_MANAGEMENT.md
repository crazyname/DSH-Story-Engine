# 内容包管理指南

以下命令都在 `D:\DSH-Story-Engine` 中运行。修改 TypeScript 后先执行 `npm run build`。

## 查看内容包

```powershell
npm run pack:list
```

结果包含有效内容包和诊断错误。发现范围为：内置示例、`packs\installed` 和 `packs\private`。

## 校验待导入内容包

```powershell
npm run pack -- validate D:\MyStoryPack
```

校验不会复制或修改来源目录。只有包含有效 `pack.json`、初始状态和安全内容路径的包才能通过。

## 安装内容包

```powershell
npm run pack -- install D:\MyStoryPack
```

安装位置为 `packs\installed\<pack-id>`。流程先复制到临时目录，再次完整校验，最后原子改名。不会覆盖同 ID 的现有内容包。

默认安全限制：

- 最多 10,000 个文件。
- 总大小最多 100 MiB。
- 禁止符号链接和特殊文件。
- 清单引用的内容路径不能离开内容包根目录。

## 生成 DSH 游戏入口

```powershell
npm run presets:sync
```

每个有效内容包会生成 `presets\story-<pack-id>`。随后重启 Story Engine，便可在 DSH 新建对话时选择对应游戏。

## 完整流程

```powershell
cd D:\DSH-Story-Engine
npm run build
npm run pack -- validate D:\MyStoryPack
npm run pack -- install D:\MyStoryPack
npm run presets:sync
pwsh -File .\start.ps1
```
