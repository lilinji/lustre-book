# 07 安全体系：Nodemap、SSK、ACL 与 ZFS 快照 (第 28~31 章)

> 来源：官方 Lustre 中文操作手册 (Lustre Chinese Operations Manual)

1 client1# 1hsmtool_posix --daemon --hsm-root /mnt/pcc --archive=1
/mt/lustre < /dev/nul1 >/tmp/copytool_1og 2>&1
2 client1# lct1 pcc add /mnt/lustre /mnt/pcc "projid-｛1000｝，uid-｛500｝ rwid-1"
3 client2# 1hsmtool_posix --daemon --hsm-root /mnt/pcc --archive-2
/mt/lustre < /dev/nul1 >/tmp/copytool_10g 2>&1
4 client2# lct1 pcc add /mnt/lustre /mnt/pcc "Projid=｛1000｝&gid=｛500｝rwid
3. 在客户端上执行 PCC 命令
1 client1# echo "00000" > /mnt/lustre/test
2 client2# lfs pcc attach -i 2 /mnt/lustre/test
3 client2# 1fs pcc state /mnt/lustre/test
4 file:/mnt/lustre/test, type: readwrite, PCC file：
/mnt/pcc/0004/0000/0bd1/0000/0002/0000/0x200000bd1:0x4:0x0,uiser
number: 1, flags: 6
5 client2# lfs pcc detach /mnt/lustre/test

## 第二十八章使用Nodemap 映射 UIDs 和 GIDs


### 28.1.设置映射

Lustre 2.9很好地支持了 nodemap 功能，此前，该技术作为预热在 Lustre 2.7中被首
次引入。它允许来自远程系统的 UID 和 GID 映射到本地UID 和GID 集，并同时保留
POSIX 的所有权、其他权限和配额信息。因此，即使来自多个站点的用户和组标识符相
互冲突，它们仍可以在单个 Lustre 文件系统上运行，而不用担心在 UID 或GID 空间中
产生冲突。

### 28.1.1.定义

启用 nodemap 功能后，客户端文件系统对 Lustre 系统的访问将通过 nodemap
标识映射策略引擎进行过滤。Lustre 连接由网络标识符（NID）管理，例
如192.168.7.121etcp。当通过 NID 进行操作时，Lustre 将决定该 NID 是否力
nodemap（由一个或多个 NID 范围组成的策略组）的一部分。如果该 NID 不存在于
任何策略组中，则默认情况下此访问会被压缩到用户nobody。策略组具有一些属
性，如 trusted 和admin，这些属性决定了访问条件。每个策略组有一组标识映射
（idmaps），这些 idmaps 决定了客户端上的 UID 和 GID 如何转换到本地Lustre 文件系统
的规范用户空间上。

为了使 nodemap 正常运行，MGS、MDS 和 OSS 系统必须都运行支持 nodemap 的
Lustre 版本。nodemap 对客户端来说是透明的，不需要特别的配置或相关设置。

### 28.1.2. NIID 范围

NID 可以被描述为单个地址或一个地址范围。单个地址标准 Lus-
tre NID 格式（如10.10.6.120@tcp），地址范围由一个短横来分隔来描述
（如192.168.20.［0-255］ @tcp）。
范围必须是连续的。一个 nidlist 的完整 LNet 定义如下：
1 <nidlist
2 <nidrange
3 <addrrange
10 <expr_list
11 <range_expr
14 <net>
15 <netname
16 ＜number
：== <nidrange［''＜nidrange ］
：= <addrrange'@'<net
：-1*1|
<ipaddr_range|
<numaddr_range
6 <ipaddr_range：==
<numaddr_range.<umaddr_range.umaddr_range.umaddr_range
8 <numaddr_range：== <number> |
<expr_1ist
：='［' <range_ expr ［'，'<range_expp］'］'
：== <number> |
<number> '-1＜number〉 |
<number>'-'<number>'/'＜number
：== <netname〉|<netname><number>
：== “1o"| "tap"| "o2ib" | "gni"
：== <nonnegative decimal> | <hexadecimal

### 28.1.3. 示例：描述和部署映射

部署 nodemap 时，首先应考虑哪些用户需要映射，以及涉及的网络地址或地址范
围。必须检查用户之间的可见性问题。
例如，假设研究人员正在研究鸟类相关数据，他们使用了一个计算系统，该系统从
单个 IPv4 地址192.168.0.100挂载Lustre 并将此策略组命名BirdResearchSite。
该IP 地址组成了其NID，即192.168.0.100@tcp。运行以下lct1命令创建策略组并
将此 NID 添加到 MGS上的相应组：

```bash
1 mgs# lctl nodemap_add BirdResearchSite
```
2 mgs# lct1 nodemap_add_range --name BirdResearchSite --range

### 192.168.0.100etcp


注意
一个 NID 不能位于多个策略组中。如果要把 NID 分配给新的策略组，请先将其从
现有组中删除。
研究人员在其主机系统上使用以下标识符：

- swan （UID 530） - wetlands （GID 600） 组成员

- duck （UID 531） -wetlands （GID 600） 组成员

- hawk （UID 532） -raptor （GID 601）组成员

- merlin （UID 533） - raptor （GID 601） 组成员
为此策略组分配六个 idmaps，其中四个用于 UID，两个用于GID。选择一个起点，
例如 UID 11000，预留空间以便添加额外的 UID 和GID。使用1ct1命令设置 idmaps：
1 mgs# lct1 nodemap_add_idmap --name BirdResearchSite --idt ype uid --idmap
530:11000
2 mgs# lct1 nodemap_add_idmap --name BirdResearchSite --iatype uid --idmap
531:11001
3 mgs# 1ct1 nodemap_add_idmap
--name BirdResearchSite --idtype uid --idmap
532:11002

```bash
4 mgs# lctl nodemap_add_idmap
```
--name BirdResearchsite --idtype uid --idmap
533:11003
5 mgs# lct1 nodemap_add_idmap --name BirdResearchSite --idt ype gid --idmap
600:11000
6 mgs# lct1 nodemap add idmap
--name BirdResearchSite --idtype gid --idmap
601:11001
参数530:11000将客户端 UID（530）映射到单个的规范 UID（11000）。每个映射
都是单独进行的，且没有方法可以指定范围530-533:11000-11003。UID和GID标
识分开进行映射，两者之间没有暗含的关系。
在 NID 192.168.0.100@tcp 的 Lustre 文件系统上使用 UID duck 和 GID
wetlands 创建的文件将使用规范标识符存储在 Lustre 文件系统中（在本例中为
UID 11001 和 GID 11000）。不同的 NID，如果不同属一个策略组，将看到同一文件空间
的各自的视图。
假设先前创建的项目目录由 UID 11002/GID 11001 所有，模式为770。当位于

### 192.168.0.100处的用户hawk和merlin将名内hawk-file和mer1in-file的文件放入

该目录时，来自 192.168.0.100 客户端的内容显示为：
1 ［merlin@192.168.0.100 projectsite］$ ls -la
2 total 34520

3 drwxrwX--- 2 hawk
raptor
4096 Jul 23 09:06 .
4 drwxr-xr-x 3 nobody nobody
4096 Ju1 23 09:02

- .
5 -rW-I--1-- 1 hawk raptor 10240000 Jul 23 09:05 hawk-file
6 -rW-Y--r-- 1 merlin raptor 25100288 Jul 23 09:06 merlin-file
在特权视图中，显示了规范标识符：
1 ［root@trustedSite projectsite］# ls -la
2 total 34520
3 drwxrw×--- 2 11002 11001
4096 Ju1 23 09:06
4 drwxr-xr-x 3 root root
4096 Jul 23 09:02 .
5 -rw- --r-- 1 11002 11001 10240000 Ju1 23 09:05 hawk-file
6 -rW-I--1-- 1 11003 11001 25100288 Jul 23 09:06 merlin-file
如果在 Lustre MDS 或MGS上不存在UID 11002或GID 11001，请在LDAP或其他
数据源上创建它们，或通过把将identitY_upca11设置为 NONE使客户端可信。
通过遍历上面的1ct1命令可以构建更大、更复杂的配置。简单来说，步骤如下：
1.命名策略组。
2. 创建策略组的一组 NID 范围。
3. 定义哪些 UID 和 GID 转换需要发生。

### 28.2. 属性变更

特权用户访问映射系统的权限取决于特定属性。默认情况下，root 访问将被压缩
至nobody用户，将对大多数管理操作造成影响。

### 28.2.1.管理属性

这些属性可以改变客户端行为，默认情况下为关闭状态：admin、trusted、
squash_uid、squash_gid和deny_unknown。

- trusted属性允许策略组的成员查看文件系统的规范标识符。在上面的例子中，
UID 11002和 GID 11001 在不进行转换的的情况下仍然可见。当本地UID 和GID
集已经直接映射到指定用户时，可以使用此功能。

- admin 属性定义root 是否在策略组中被压缩。默认情况下 root 被压缩，除非启用
此属性。结合 trusted属性将允许备份节点、传输节点或其他管理挂载节点的非
映射访问。

- deny_unknown 属性拒绝访问所有未映射到特定 nodemap 的用户。如果您希望拒
绝未映射的用户访问文件系统以满足安全要求，请使用该属性。


- squash_uid 和 squash_gid定义了未映射用户被默认压缩到的 UID 和 GID。
如果使用了deny_unknown标志，所有访问都将被拒绝。
在MGS更改其值，1代表”真”，2代表”假”。
1 mgs# lct1 nodemap_modify --name BirdAdninSite --property trusted --value 1
2 mgs# lct1 nodemap_modify --name BirdAdminSite --property admin --value 1
3 mgs# lct1 nodemap_modify --name BirdAdninSite --property deny_unknown
--value 1
如果策略组处于活动状态，请在系统停机期间更改值，从而尽量减少出现所有权或
权限问题的可能性。虽然可以进行实时更改，但由于更改发布前有几秒的前置时间，客
户端进行数据缓存时可能会影响更改。

### 28.2.2. 混合属性

同时设置 admin和 trusted时，策略组具有Lustre 文件系统的完全访问权限（就
像关闭了 nodemap 一样）。Lustre 文件系统的管理站点至少需要一个具有两个属性的组
来执行维护或管理任务。
注意
MDS 系统必须位于同时具有这两个属性的策略组中。建议将 MDS放入标记
为"TrustedSystems" 的策略组或在标识中明确此关联。
如果策略组设置了 admin 属性但没有设置trusted 属性，则root 将直接映射到
root，任何显式指定的UID 和GID idmaps 将被允许，而其他访问会被压缩。如果root用
户将所有权更改本地主机已知但不属于idmap 的UID 或GID，则root 会将这些文件
的所有权有效地更改为默认的压缩UID 和 GID。
如果设置了 trusted 属性但没有设置admin 属性，则策略组可以完全访问 Lustre
文件系统的规范 UID 和GID 集，且root 被压缩。
一旦启用deny_unknown属性，未映射的用户访问文件系统将被拒绝。如果未设置
admin 属性且.root 不是任何映射的一部分，root 访问也会被拒绝。
修改 nodemap 时，更改事件将排队并在整个集群中分布。在正常情况下，这些更改
大约需要十秒的传播时间。在此期间，文件访问可能使用旧的 nodemap 设置，也可能使
用新的nodemap 设置。因此，建议为此维护窗口保存更改或在映射节点没有在文件系统
中进行写操作时部署变更。

### 28.3. 启用 nodemap

启用 nodemap 功能非常简单：
1 mgs# lct1 nodemnap_activate 1

相反，传递参数0将再次禁用该功能。在部署该功能之后，请在允许客户端挂载文
件系统之前验证映射是否完整.
（在Lustre 2.8中引入）
至此，变更已在MGS上生效。在Lustre 2.9之前，还必须在MDS系统上手动更改
设置。另外，如果执行了配额，则必须使用1ct1 set_param（不是1ct1）将更改手
动部署到 OSS服务器，在2.9之前，该配置并非永久生效，需要在每次 Lustre 重启后都
使用脚本生成映射。请参照以下示例在 OSS上部署设置：
1 oss# lct1 set_param nodemap.add _nodemap-SiteName
2 oss# 1ctl set_param nodemap.add
_nodemap_range-'SiteName 192.168.0.15etcp'
3 oss# lct1 set_param nodemap.add_nodemap_idmap-'SiteName uid 510:1700'
4 oss# lct1 set_paran nodemap.add_nodemap_idmap-'Siteame gid 612:1702'
在 Lustre 2.9及更高版本中，nodemap 配置保存在MGS 中，并自动分发到MGS、
MDS 和OSS 节点，正常情况下这一过程在大约需要10秒钟。

### 28.4.default Nodemap

有一个特殊的 nodemap ™default。顾名思义，它是默认创建的，且不能删除。它
就像一个后备 nodemap，为 Lustre 客户端设置与任何其他nodemap 都不匹配的行为。
由于其特殊的角色，只能在default nodemap 上设置一些参数：

- admin

- trusted

- squash_uid

- sguash
_gid

- fileset

- audit_mode
在默认节点映射上不能定义任何 UID/GID 映射。
注意
更改defau1tnodemap 的admin和trusted属性时要小心，尤其是当您的Lustre 服
务器属于此nodemap 时。

### 28.5. 校验设置

使用1ct1 nodemap_info a11可列出现有的nodemap 配置，并可导出。
该命令相当于通过/proc接口访问 nodemap 的快捷方式。在 Lustre MGS
的/proc/fs/luster/nodemap/中，如果nodemap 在系统上处于活动状态，则
active 包含"1"。在每个策略组中创建一个包含以下参数的目录：


- admin和 trusted 在设置了值的情况下包含"！”，否则为"0”。

- idmap 包含策略组的idmaps列表。ranges 包含策略组的 NID列表。

- sguash_uid和squash_gid哪些 UID 和GID 用户被压缩（必要的话）。
在BirdResearchSite 的例子中，预计结果为：
1 mgs# lct1 get_param nodemap.BirdResearchsite.idmap
［
10 ］
［
］
｛ idtype: uid, client_id: 530, fs_id: 11000 ｝，
｛ idtype: uid, client_id: 531, fs_id: 11001 ｝，
｛ idtype: uid, client_id: 532, fs_id: 11002 ｝，
｛ idtype: uid, client_id: 533, fS_id: 11003 ｝，
｛ idtype:gid, client_id: 600, fs_id: 11000 ｝，
｛ idtype: gid, client_id: 601, fS_id: 11001 ｝
12 mgs# lct1 get_param nodemap.BirdResearchSite.ranges
｛ id: 11,start_nid: 192.168.0.100etcp, end_nid: 192.168.0.100etcp ｝

### 28.6.确保一致性

当 Luster 客户端从未知的 NID 范围进行挂载、添加了不属于已知映射的新的 UID
和GID、规则中存在错误配置时，启用 nodemap 可能会出现一致性问题。在生产系统上
激活 nodemap 时请注意以下事项：

- 可在生产系统上创建新的策略组或idmaps，但为避免元数据问题，请保留一个维
护窗口来更改trusted 属性。

- 执行管理任务，请使用设置了trusted 和 admin 属性的策略组访问 Lustre 文件
系统。这可以防止创建孤立文件和压缩文件。在没有同时授予trusted 属性的情
况下授予admin属性很危险，客户端上的 root 用户可能知道没有在任何 idmap 中
出现的 UID 和GID。如果root 用户将所有权更改为这些标识符，那么所有权将被
压缩。例如，提取 tar 文件可能从预期的 UID（如UID 500）变nobody（通常力
UID 99）。

- 要将两个或更多站点上的不同UID 映射到Lustre 文件系统上的单个 UID 或GID，
请创建相互有重叠的idmaps 并将每个站点放置在其自己的策略组中。每个不同的

UID 到目标 UID 或GID 可能有不同的映射。

- 在Lustre 2.8中，必须手动将更改保存在脚本文件中以便Lustre 重载后再重新应
用。由于在节点之间没有自动同步机制，这些更改必须在每个 OSS,MDS 和 MGS
节点上都部署。

- 如果deny_unknown有效，未映射的用户可能会看到映射用户才能看到的条目
（由于客户端进行了缓存），但无法查看任何文件内容。

- 使用1ct1 nodemap_info可查看 nodemap 激活状态。如果您希望进行额外的验
证并确保生产系统上的有效部署，一种方法是创建已知文件的指纹，将特定 UIDs
和GIDs映射到测试客户端。完成Lustre 系统维护后联机，则测试客户端可以在挂
载到用户空间之前验证 UID 和GID 是否正确地映射。（在Lustre 2.9中引入）

## 第二十九章配置共享密钥（SSK）


### 29.1.SSK安全概述

SSK 功能保护了 Lustre PRPC 流量数据，确保了其数据完整性。共享属性和会话
特定属性集成到 SSK 密钥文件中，分发给 Lustre 主机。Lustre 主机依据授权挂载文件系
统，并根据不同的安全特性配置而启用不同的安全模式进行数据传输。管理员负责 SSK
密钥文件的生成，分发和安装，请参见本章第3.1 节“密钥文件管理”。

### 29.1.1.关键功能

SSK 提供了以下关键功能：

- 基于主机的认证

- 数据传输隐私性

- Lustre RPCs 加密

- 防窃听

- 数据传输完整性：密钥哈希消息认证码（HMAC）

- 防止中间人攻击

- 确保 RPCs 不会遭到未检测的更改

### 29.2. SSK 安全特性

SSK 以一种 General Security Services （GSS） 机制的形式，通过 Lustre 支持的Gss
应用程序接口（GSSAPI）来实现。SSK GSS 机制支持五种不同级别的保护：

- skn -SSK Null（仅身份认证）

- ska-用于非批量RPC的SSK 身份和完整性验证


- ski-SSK 身份和完整性验证

- skpi-SSK 身份、隐私和完整性验证

- gssnu11-无保护，仅作测试用
下表描述了每种特性的安全性质。
Table 1. SSK 安全保护
skn ska ski skpi
挂载文件系统时需验证 是是是是
提供 RPC完整性
否是是是
提供 RPC 隐私性
否否否是
提供批量RPC完整性
否否是是
提供批量RPC隐私性
否否否是
有效的非 GSS 特性包括：
nul1-无保护，为默认值。
Plain -在每个 RPC 上使用哈希列表的明文。

### 29.2.1.RPC 安全规则

使用1ct1命令将 RPC 安全配置规则写入 Lustre 日志（Ilog）。规则通过Ilog 进行处
理，它规定了用于特定Lustre 网络或方向的安全特性。
注意
规则只需几秒钟即可生效，将影响现有连接和新建连接。
规则格式：target.stpc.flavor.network［.direction］=flavor

- target - 可文件系统名或特定 MDT/OST 设备名。

- network- RPC启动程序的LNet 网络名。如：tcp1或o21b0。如没有指定特定网
络，该值也可为关键字default，以指代所有网络。

- direction-可选。可为mdt2mdt、mdt2ost、c1i2mdt或cli2ost中的一个。
注意
要确保与 MGS的安全连接，请使用mgssec = f1avor 的挂载选项。这是必需的，
因为发起方在 MGS连接建立之前不知道安全规则。
以下示例适用于名为testfs的测试用 Lustre 文件系统。


### 29.2.1.1.定义规则 规则可以按任何顺序定义和删除。对于给定连接，采用描述最具体

的规则。fsname.srpc.flavor.default规则限定的范围最广，因为它适用于文件
系统内所有非 MGS的连接。您可以根据您的需求定制 SSK 安全特性，进一步指定特定
目标、网络或方向。
以下示例给出了为三个 LNet 网络组成的环境配置 SSK 安全性的方法。需求为：

- 所有非 MGS连接都必须经过认证。

- LNet 网络tcp0上的PIRPC 流量必须加密。

- LNet 网络tcp1和o2ib0是高性能的本地物理安全网络，位于其上的PtRPC流量
不需要加密。
1. 确保所有非MGS 连接在默认情况下都经过身份验证和加密。
mgs# lct1 conf_param testfs.srpc.flavor.default=skpi
2. 在 LNet 网络tcp1和o2ib0上使用安全特性ska覆盖文件系统默认的安全特性。
ska 提供了身份验证，但没有提供加密和批量 RPC完整性。
mgs# lct1 conf_param testfs.srpc.flavor.tcp1=ska
mgs# lct1 conf_param testfs.srpc.flavor.o2ib0=ska
注意
目前，"Ict1 set_param -P" 格式和 sptlrpc 不兼容。

### 29.2.1.2. 列出规则 查看 RPC 安全配置规则，请输入：

mgs# lct1 get_param mgs.*.live.testfs
….
Secure RPC Config Rules：
testfs.srpc.flavor.tcp.cli2mdt=skpi
testfs.srpc.flavor.tcp.cli2ost=ski
testfs.srpc.flavor.o2ib=ski
…..

### 29.2.1.3. 删除规则

使用conf
_param -d 命令删除某 LNet 网络的安全特性：
例如，删除 testfs.srpc.flavor.o2ib1=ski规则，输入：
1 mgs# lct1 conf param -d testfs.srpc.flavor.o2ib1


### 29.3. SSK密钥文件

SSK 密钥文件是一组属性的集合，由管理员分发给各客户端和服务器节点。这些属
性被格式化为固定长度值并存储在文件中，它们包括：

- Version - 密钥文件模式版本号。非用户定义。

- Type-表示密钥文件使用者的 Lustre 角色，为强制属性。有效的密钥类型有：

- mgs - MGS，当使用 mgssec 和mount.lustre 选项时。

- server- MDDS 或OSS 服务器。

- client-客户端及在客户端环境中与其他服务器进行通信的服务器（如与OST通信
的 MDS）。

- HMAC algorithm- 用于完整性的密钥哈希消息认证代码算法。有效的算法有（默
认沩 SHA256）：

- SHA256

- SHA512

- Cryptographic algorithm -用于加密的密码算法。有效的算法有（默认 AES-256-
CTR）。

- AES-256-CTR

- Session security context expiration- 由密钥生成的会话环境到密钥过期须重新生成
的秒数（默认值：604800秒，即7天）。

- Shared key length - 共享密钥长度（以位为单位，默认值：256）。

- Prime length - 用于 Diffie-Hellman 密钥交换（DHKE）的素数 （p）长度（以位力
单位，默认值：2048）。仅用于生成客户端密钥，并可能需要一段时间。此值同时
也是服务器和 MGS 从客户端接受的最小素数长度。尝试用长度小于此最小值进行
连接的客户端将被拒绝。通过这种方式，服务器可以保证最低加密级别。

- File system name- Lustre 文件系统名。

- MGS NIDs-由逗号间隔的MGS NID 列表。只有当使用了mgssec时才是必要的
（默认值："T）。

- Nodemap name - Nodemap 名称（默认值：default）。

- Shared key - 被所有SSK 特性共享的共享密钥，提供身份认证。

- Prime （p）- 用于 Diffie-Hellman 密钥交换（DHKE）的素数。仅用于类型
Type=client的密钥。
注意
密钥文件提供了验证 Lustre 连接的方法，请安全地存储和传输密钥文件。密钥文件
不能全局写入，否则将导致无法加载。


### 29.3.1.密钥文件管理

1gss_sk 功能用于读、写、更改SSK 密钥文件。1gss_sk可以用来将密钥文件单
独加载到内核密钥环中。1gss_sk选项包括：
Table 2. Igss_sk 参数
参数
值
-11--load
-ml--modify
-rI--read
-w|--write
-cI--crypt
-11--hmac
-el--expire
-fI--fsname
-gl--mgsnids
-n|--nodemap
-Pl--prime-bits
-tl--type
-kl--key-bits
-dl--data
-v|--verbose
说明
flename 将文件中的密钥安装到用户的会话密钥环中。必须由
root执行。
filename 更改文件的密钥属性
filename
显示文件的密钥属性
filename
生成文件密钥
cipher
加密算法（默认：AES 计数器模式）；AES-256-CTR。
hash
用于完整性的哈希算法（默认：SHA256）；SHA256
或SHA512。
seconds
由密钥登入的会话过期的秒数（默认：604800，即7天）
name
NID（s）
文件系统名
由逗号间隔的 MGS NID 列表。只有当使用了mgssec
时才是必要的（默认值：""）。
map
length
Nodemap 名称（默认值：default）。
用于 DHKE的素数（P） 长度（以位为单位，默认
值：2048）。
type
length
file
密钥类型（mgs, server, client）
共享密钥长度（以位为单位，默认值：256）。
共享密钥随机数据源（默认：/dev/random）
包含错误信息的详细版信息

### 28.3.1.1. 写入密钥文件 密钥文件由1gss_sk工具生成，通过在命令行后附

加--write参数和要写入的文件名来指定参数。1gss_sk工具不会覆盖文件，
因此文件名必须是唯一的。--type是生成密钥文件的强制参数，--fsname，
--mgsnids和--write等其他参数都是可选的。

1gss_sk使用/dev/random作为默认的熵数据源，可使用--data参数覆盖它。当
执行1gss_sk的系统上没有硬件随机数生成器时，您可能需要按键盘上的键或移动鼠
标（如果直接连接到系统），以便共享密钥生成熵；如果系统是远程的，可能将导致
磁盘10。可以使用/dev/urandom进行测试，但这可能会在某些情况下降低安全性。
例如，要在 biology nodemap 中次客户端的 testfs Lustre 文件系统创建 server 类型密
钥文件，请输入：
I server# lgss_sk -t server -f testfs -n biology\
2 -w testfs.server.biology.key

### 28.3.1.2. 修改密钥文件 像写入密钥文件一样，您可以通过在命令行上指定要更改的参

数来修改它们。只有与指定的参数相关联的密钥文件属性会发生更改，所有其他属性保
持不变。
修改客户端密钥文件的 type 属性，并填充Prime （p） 密钥属性（如果缺失的话），请
输入：
client# lgss_sk -t client -m testfs.client.biology.key
在服务器密钥文件 testfs.server.biology.key 和客户
端密钥文件 testfs.client.biology.key中添
加 MGS NIDs

### 192.168.1.101@tcp,10.10.0.101@o2ib：

server#
1gss_sk -g 192.168.1.101etcp,10.10.0.101@2ib、
-m testfs.server.biology.key
client# 1gss_sk -g 192.168.1.101@tcp,10.10.0.1010o2ib\
-m testfs.client.biology.key
在MGS上修改testfs.server.biology.key 以支持 biology 客户端到MGS的
连接，更改密钥文件的 Type 属性，在 server 的基础上添加 mgs：
mgs# lgss_sk -t mgs,server -m testfs.server.biology.key

### 28.3.1.3.读取密钥文件 使用1gss_sk工具和--read 参数读取密钥文件。下面的例

子中，我们读取了上面修改过的密钥文件：
mgs# lgss_sk -r testfs.server.biology.key
Version：
Type：
mgs server
HMAC alg：
SHA256
Crypt alg：
AES-256-CTR
Ctx Expiration: 604800 seconds

Shared keylen: 256 bits
Prime length: 2048 bits
File system：
testfs
MGS NIDs：

### 192.168.1.101etcp 10.10.0.101@o2ib

Nodemap name: biology
Shared key：
0000: 84d2 561f 37b0 4a58 de62 8387 217d c30a ..V.7.JX.b..！｝..
0010:1caa d39c b89f ee6c 2885 92e7 0765 c917
…L（.@…
client# lgss_sk -r testfs.client.biology.key
Version：
Type：
client
HMAC alg：
SHA256
crypt alg：
AES-256-CTR
Ctx Expiration: 604800 seconds
Shared keylen: 256 bits
Prime length: 2048 bits
File system：
testfs
MGS NIDs：

### 192.168.1.101etcp 10.10.0.1010o2ib

Nodemap name：
biology
Shared key：
0000: 84d2 561f 37b0 4a58 de62 8387 217d c30a
..V.7.JX.b..！｝..
0010:1caa d39c b89f ee6c 2885 92e7 0765 c917

- ...1（....e..
Prime （p）：
0000:8870 c3e3 09a5 7091 ae03 E877 f064 c7b5.p....p....w.d..
0010:14d9 bc54 75£8 80d3 22f9 2640 0215 6404 •..Tu...".&e..d.
0020:1c53 ba84 1267 bea2 fb05 37a4 ed2d 5d90 .S...g....7..-］.
0030:84e3 1a67 67E0 47c7 0c68 5635 f50e 9cf0
...gg.G..hV5...
0040: e622 6f53 2627 6af6 9598 eeed 6290 9ble ."oS&'j.....b...
0050: 2ec5 df04 884a ea12 9f24 cadc e4b6 e9ld •.J...S...
0060:362f a239 0a6d 0141 b5e0 5c56 9145 6237 6/.9.m.A..\V.Eb7
0070:59ed 3463 90d7 1cbe 28d5 a15d 30f7 528b Y.4c....（..10.R.
0080: 76a3 2557 e585 a1be c741 2a81 Oaf0 2181
v.eW.....A*...！.
0090:93cc a17a 7e27 6128 5ebd e0a4 3335 db63

- ..Z~'a（^...35.c
00a0: c086 8d0d 89c1 c203 3298 2336 59d8 d7e7
⋯.2.#6Y...
00b0:e52a b0oc 088f 71c3 5109 ef14 3910 fcf6
.*..9.0...9...

00c0: OfaO Tdb7 4637 bb95 75f4 eb59 b0cd 4077 •｝.F7..U..Y..Cw
00d0: 8f6a 2ebd f815 a9eb 1677 c197 5100 84c0 •j..•....W..Q...
O0e0: 3dco d75d 40b3 6be5 a843 751a b09c 1b20 =..］e.k..Cu....
00f0: 8126 4817 e657 b004
06b6 86fb 0e08 6a53

- &H..W.•••••jS

### 28.3.1.4. 载入密钥文件 将密钥文件加载到内核密钥环中，可使用1gsS_sk工具，也可

在挂载时使用skpath挂载选项。skpath方法的优点是它将接受一个目录路径并将目
录中的所有密钥文件都加载到密钥环中。而1gsS_sk工具在每次调用时将单个密钥文
件加载到密钥环中。密钥文件不能全局写入，否则将无法加载。
如果必要的话，也可以使用第三方工具加载密钥。唯一需要注意的是，
当request_
key向用户空间回调时，密钥必须可用并使用正确的密钥描述，以便
在回调期间找到它（请参阅密钥描述）。
例如，使用1gss_sk载入 testfs.server.biology.key 密钥文件：
server# lgss_sk -1 testfs.server.biology.key
在挂载存储目标时，使用 skpath 挂载选项载人在/secure_directory 目录下
的所有密钥文件，请输入：

```bash
server# mount -t lustre -O skpath-/secure_directory\
```
/storage/target /mount/point
在客户端上使用 skpath 挂载选项将密钥文件载入密钥环：

```bash
client# mount -t lustre -o skpath-/secure_directory\
```
mgsnode:/testfs /mnt/testfs

### 29.4. Lustre GSS 密钥环

Lustre GSS 密钥环二进制文件1gss_keyring被SSK 用来处理 request-key从
内核空间向用户空间回调的操作。1gss_keyring的目的是创建一个令牌，作为安全环
境初始化 RPC（SEC_CTX_INIT）的一部分进行传递。

### 29.4.1.设置

Lustre GSS 密钥环类特性利用 Linux 内核密钥环基础结构来维护密钥、执行从内
核空间到用户空间的回调以完成密钥的协商或建立。当加载 Lustre pt1rpc_gss内核
模块时，GSS密钥环将创建一个名为1gssc的密钥类型。当必须建立安全环境时，它
会创建一个密钥并使用回调中的 request-key二进制文件来建立密钥。该密钥将
在/etc/request-key.d中查找名称为 keytype.conf形式的配置文件，对于 Lustre 来
说该配置文件1gssc.conf。

SSK 安全涉及的每个节点都必须有/etc/request-key.d/1gssc.conf文件，
且文件中包含以下语句：
create lgssc * * /usr/sbin/1gss_keyring 80 gk et 8d sc gu
sg aer aeP aes
reguest-key 二进制将调用 lgss_keyring，请使用相应的值代入随后的参数。

### 29.4.2.服务器设置

Lustre 服务器不像客户端那样使用 Linux request-key 机制，而是运行守护进程。
该守护进程使用 pipefs 来触发基于文件描述符读写操作的事件。服务器端的二进制文件
是1svcgssd，它可以在前台或作为守护进程执行。以下是1svcgssd的参数，它需要
明确启用各种安全特性（gssnull，krb5，sk）。这将确保仅启用所需的功能。
Table 3. Isvcgssd 参数
参数 说明
-f
-V
-m
-k
-S
-Z
在前台运行
不建立 Kerberos 凭证
详细版
MDS 服务器
OSS 服务器
MGS服务器
启用 Kerberos
启用共享密钥
启用gssnul1
安装 SysV 样式的初始化脚本来启动和停止1svcgssd守护进程。初始化脚本将检
查/etc/sysconfig/1svcgss配置文件中的LSVCGSSARGS变量用作启动参数。
通过内核密钥环中的每个密钥的特定描述查找客户端的回调期间以及服务器处理
RPC期间的密钥。
每个MGS NID 必须加载一个单独的密钥。密钥描述的格式如下表所示：
Table 4.密钥描述
类型
MGC
密钥描述
Lustre:MGCNID
示例
lustre:MGC192.168.1.10etcp

类型
密钥描述
示例
MDC/OSC/OSP/LWP lustre:fsname
lustre:testfs
MDT
OST
MGS
lustre:fsname:NodemapName lustre:testfs:biology
lustre:fsname:NodemapName lustre:testfs:biology
lustre:MGS
lustre:MGS
Lustre 的所有密钥都使用 user 的密钥类型，并被附加到用户的密钥环中。这是不
可配置的。以下示例显示了如何列出用户的密钥环、加载密钥文件、读取密钥，以及从
内核密钥环中清除密钥。
1 client# keyct1 show
2 Session Keyring
3 17053352 --alswrv
4 773000099 --alswrv
0 65534
0 keyring：_ses
\ keyring：_uid.O
6 client# lgss_sk -1 /secure_directory/testfs.client.key
8 client# keyct1 show
9 Session Keyring
10 17053352 --alswrv
11 773000099 --a1swrv
0 65534
12 1028795127--alswrv
0 keyring：_ses
Lkeyring：_uid.0
user: lustre:testfs
14 client# keyct1 pipe 1028795127 | 1gss_sk -r -
15 Version：
16 Type：
client
17 HMAC alg：
SHA256
18 Crypt alg：
AES-256-CTR
19 Ctx Expiration: 604800 seconds
20 Shared keylen: 256 bits
21 Prime length：
2048 bits
22 File system：
testfs
23 MGS NIDs：
24 Nodemap name：
default

25 Shared key：
0000: faaf 85da 93d0 6ffc f38c a5c6 f3a6 0408
...........
0010:1e94 9b69 cf82 d0b9 880 f173 c3ea 787a

- •.i....S..XZ
28 Prime（P）：
0000:9c12 ed95 7b9d 275a 229e 8083 9280 94a0 ••.｛.'Z.
0010: 8593 162 a537 aa6f 8b16 5210 3dd5 4c0c ....7.0..R.=.L.
0020: 6fae 2729 Ecea 4979 9435 f989 5b6e 1b8a o.'）..Iy.5..［n..
0030:5039 8d2 3a23 31f0 540c 33cb 3b8e 6136 P9..：#1.T.3.i.a6
0040: ac18 leba f79f c8dd 883d b4d2 056c 0501

- ••.=...］..
0050: ac17 a4ab 9027 4930 1d19 7850 2401 7ac4

- ••'IO..XPS.z.
0060: 92b4 2151 8837 ba23 94cf 22af 72b3 e567

- 19.7.#.".r.g
0070:30eb 0cd4 3525 8128 bOff 935d 0ba3 0fc0 0...5.（...］•••.
0080: 9afa 5da7 0329 3ce9 e636 8a7d c782 6203 ..］..）<..6.｝..b.
0090:bb88 012e 6le7 5594 4512 4e37 e0ld bdfc •...a.U.E.N7....
00a0: cbld 6bd2 6159 4c3a 1f4f 1167 0e26 9e5e ..k.aYL：.0.g.&.^
00b0: 3cdc 4a93 63f6 24b1 e0f1 ed77 930b 9490 <.J.c.S....w. ...
00c0: 25ef 4718 bff5 033e 11a e769 4969 8a73 .G...>...iIi.s
O0d0: 9f5f b7bb 9faO 7671 79a4 0d28 8a80 leal
00e0: a4df 98d6 e20e fe10 8190 5680 0d95 7c83

- _•.V9Y..（.
...V....
46 client# keyct1 clear @u
48 client# keyct1 show
49 Session Keyring
50 17053352 --alswrv
773000099 --alswrv
O0fO:6e21 abb3 a303 ff55 0aa8 ad89 b8bf 7723 n！.....U......w#
0 65534
0 keyring：_ses
keyring：_uid.O

### 29.4.3. 调试 GSS密钥环

Lustre 客户端和服务器支持不同的调试级别，如下所示：

- 0-显示错误

- 1- 显示警告

- 2-更多信息

- 3-调试

- 4-追踪

在客户端上设置调试级别，设置如下 Lustre 参数：
sptlrpc.gss.lgss_keyring.debug_level
将调试级别设为追踪：
client# lct1 set_param sptlrpc.gss.Igss_keyring.debug_level=4
通过向守护程序的命令行参数添加”详细”标志（-v）来增加服务器端调试显示信
息的详细程度。在前台运行1svcgssd守护进程，并设置（-v）以支持详细版的gssnull和
SSK：
server#
lsvcgssd -f -vvv -z -s
Igss_keyring 是作为request-key upcall 的一部分被调用的，它没有标准的输出，因此
日志记录是通过syslog记录的。使用1svcgssd记录服务器端日志，在前台执行时将写
入标准输出，在守护进程模式下将写入系统日志 syslog。

### 29.4.4. 撤销密钥

上面讨论的使用1gss.
sk和skpath挂载选项的密钥并不会被撤销。它们仅用于为
客户端连接创建有效的环境，以下两种方式的任一种将使它们失效。

- 从服务器上的用户密钥环中卸载密钥会导致新的客户端连接失败。如果不再需要
它可以删除。

- 更改服务器上客户端的 nodemap 名称。由于 nodemap 是共享密钥环境实例的一个
组成部分，重命名一组 NID 所属的 nodemap 会阻止创建新的密钥环境。
目前还没有从 Lustre 上清除密钥环境的机制。可以从服务器上卸载目标来进行清
除；也可以在创建密钥时使用更短的密钥环境时限，以便环境（比默认）更频繁地刷
新。具体设置的超时时间取决于用例，3600秒是一个合理值，即每隔一小时必须重新协
商密钥环境。

### 29.5. Nodemap 在SSK 中的作用

SSK 使用 Nodemap（请查看第28章，通过Nodemap 映射UID 和GID）策略组名称
及其关联的 NID 范围，作为防止密钥文件伪造的一种机制，从而控制某密钥文件所能使
用的 NID 范围。
客户端假定自己处在正在使用的密钥文件中指定的 nodemap 中。当客户端初始化
安全上下文时，会触发一个回调，回调中包含了上下文信息。利用这些上下文信息，
request-key 将调用1gss_keyring，并反过来为MGC 查找密钥，查找的描述符为
lustre:fsname 或lustre:target_name。使用在用户密钥环找到的与描述相匹配的密钥，从
密钥读取 nodemap 名称，用 SHA256 算法计算哈希值并发送到服务器。

服务器查找客户端的 NID 以确定它与哪个 nodemap 关联，将 nodemap 名称发送
给1svcgssd。1svcgssd守护程序将验证 HMAC是否等于客户端发送的 nodemap 值。
当客户端的 NID 与服务器上定义的nodemap 名称没有关联时，密钥无效，从而防止了
密钥文件伪造。
SSK执行客户端NID 到 nodemap 的名称查找无需激活 nodemap 功能。

### 29.6. SSK 示例

这一小节的例子中，我们用了1个 MGS/MDS （NID 172.16.0.1@tep），1个 OSS （NID

### 172.16.0.3@tcp）和2个客户端。Lustre 文件系统名为 testfs。


### 29.6.1.客户端到服务器的安全通信

本示例阐述了如何配置 SSK，将隐私和完整性保护应用于tcp 网络上的客户端到服
务器的 PtRPC 流量。我们使用规则指定了方向，在这里为c112mdtand 和cli2ost。
该配置不提供服务器到服务器的保护，请参阅第"6.3.确保服务器到服务器的通信安全"。
服务器到服务器通信的安全特性在这里为 null（所有Lustre 连接的默认特征）。
1. 创建存储 SSK 密钥文件的安全目录。
1 mds# mkdir /secure_directory
2 mds# chmod 600 /secure_directory
3 oss# mkdir /secure_directory
4 oss# chmod 600 /secure_directory
5 cli1# mkdir /secure_directory
6cli1# chmod 600 /secure_directory
7 cli2# mkdir /secure_directory
8 cli2# chmod 600 /secure_directory
2. 为MDS和OSS服务器生产密钥文件，运行：
1 mds# lgss_sk -t server -f testfs -w \
2 /secure directory/testfs.server.key
3. 将密钥文件/secure_directory/testfs.server.key可靠地拷贝到OSS上。
1 mds# scp /secure_directory/testfs.server.key\
oss:/secure_directory/
4. 将密钥文件/secure_directory/testfs.server.key 可靠地拷贝到 client/
上的/secure_directory/testfs.client.key 中。

I mds# scp /secure_directory/testfs.server.key\
client1:/secure_directory/testfS.client.key
5. 在 clientl上将密钥文件类型改为client。此操作同时也生成了长度为 Prime
length 的素数以填充 Prime（p）属性，运行：
1 client1# 1gss_sk -t client\
-m /secure_directory/testfs.client.key
6. 在所有含'create lgssc * * /uSr/sbin/1gss_keyring 80
ek at ed ec eu ag er e es'
（没有单引号）的节点上创建
/etc/request-key.d/lgssc.conf 文件：
1 mds# echo create lgssc * */usr/sbin/Igss_keyring %o 8k et 8d 8c 8u %g 8r
eP es > /etc/request-key.d/lgssc.conf
oss# echo create lgssc * * /usr/sbin/lgss_keyring %o 8k et %d 8c au ag
eT eP eS > /etc/request-key.d/lgssc.conf
client1# echo create lgssc * * /uSr/sbin/lgss_keyring 8o 8k 8t 8d 8c 8u
ag gT sP es > /etc/request-key.d/lgssc.conf
client2# echo create lgssc * * /uSr/sbin/lgss_keyring 8o 8k 8t 8d 8c 8u
eg er eP es > /etc/request-key.d/lgssc.conf
7. 在MDS 和 OSS 上配置 1svcgss 守护程序。在MDS上的
/etc/sysconfig/1svcgss 中，将LSVCGSSDARGS 变量的值设置为'-s
-m'。在OSS上的/etc/sysconfig/1svcgss中，将 LSVCGSSDARGS 变量的
值设为'-s -o'。
8. 在MDS和OSS 上启动 1svcgssd 守护程序，运行：
mds#
systemctl start lsvcgss.service oss#
systemctl start
lsvcgss.service
9.使用-o skpath=/ secure_directory挂 载选项挂载 MDT 和 OST。
skpath选项将目录中找到的所有 SSK 密钥文件加载到内核密钥环中。
10. 将客户端到 MDT 连接、客户端到 OST 连接的安全特性设置保障SSK 隐私性和
完整性，即skpi：
1 mds# lct1 conf_param testfs.srpc.flavor.tcp.cl i2mdt=skpi
2 mds# lct1 conf_param testfs.srpc.flavor.tcp.cl i2ost=skpi

11. 在 clientl 和 client2上挂载文件系统 testfs。

```bash
1 client1# mount -t lustre -o skpath=/secure_directory 172.16.0.1@tcp:/testfs
```
/mnt/testfs

```bash
2 client2# mount -t lustre -o skpath=/secure_di rectory 172.16.0.1etcp:/testfs
```
/mnt/testfs
3 mount.lustre: mount 172.16.0.1@tcp:/testfs at /mt/testfs failed：
Connection refused
12. client2 未能通过身份验证，因为它没有有效的密钥文件。请重复步骤4和5，将
clientl 替换为 client2，然后再将文件系统 testfs 安装到 client2上：

```bash
1 client2# mount -t lustre -O skpath=/secure_directory 172.16.0.1etcp:/testfs
```
/mnt/testfs
13. 确认 mdc 和osc连接使用了 SSK机制，rpc和bu1k 安全特性为skpi。请参阅"7.
查看PRPC 安全环境"。
请注意，mgc到MGS的连接没有可靠的PRPC 安全环境。这是因为我们在步骤
10中仅客户端到 MDT 和客户端到 OST连接指定了skpi安全特性。以下示例详
细说明了保护客户端到 MGS的连接所需步骤。

### 29.6.2. MGS安全通信

此示例建立在之前示例的基础上。
1.在 MGS上启用 1svcgss
MGS 服务。在
MGS 上编
辑/etc/sysconfig/1svcgss，将参数（-g）添加到变量 LSVCGSSDARGS上。
重启 1svcgss 服务。
2. 在MDS 上将 mgs 密钥类型和 MGS NIDs 添加到密钥文件
/secure_directory/testfs.server.key中。
、、
mgs#t lgss_sk -t mgs,server -g 172.16.0.1@tcp, 172.16.0.2@tcp -m /secure_directory/
testfs.server.key ''
3. 在MGS载入更改后的密钥文件，运行：
mgs# lgss_sk -1 /secure_directory/testfs.server.key
4. 在客户端
client1
上将MGS NIDS 添加至密钥文件
/secure_directory/testfs.client .key中。

1 client1# 1gss_sk -g 172.16.0.1etcp,172.16.0.2etcp -m
/secure_directory/testfs.client.key
5. 在 clientl 上卸载文件系统 tests，用挂载选项 mgssec=skpi 重新挂载文件系统：

```bash
1 cli1# mount -t lustre -o mgssec-skpi,skpath=/secure_directory
```

### 172.16.0.1@tcp:/testfs /mnt/testfs

6. 确认 clientl 的 MGC 连接使用了 SSK 机制及skpi 安全特性。请参阅"7.查看
PIRPC安全环境"。

### 29.6.3.服务器之间的安全通信

此示例阐述了如何配置 SSK，实现在 tcp 网络上MDT 到 OST 的PRPC流量的完
整性保护和 ski 安全特性。
此示例建立在之前示例的基础上。
1.为Lustre 文件系统在 MGS上创建名为 Lustreservers 的 nodemap 策略组，输
入：

```bash
mgs# lctl nodemap_add LustreServers
```
2. 将 MDS和 OSS NIDs 添加到 nodemap LustreServers中：
mgs#|
lct1 nodemap_add
_range --name LustreServers --range

### 172.16.0.［1-3］@tcp

3. *Lustreservers nodemap 中所有节点创建类型为mgs,server 的密钥文件。
1、、
2 mds# lgss_sk -t mgs,server -f testfs -g\
3 172.16.0.1etcp, 172.16.0.2etcp -n Lustreservers -w \
4 /secure_directory/testfs.IustreServers.key
4. 将密钥文件/secure_directory/testfs.LustreServers.key 可靠地拷贝
至OSS。
2 mds# sop /secure_directory/testfs.IustreServers.key oss:/secure_directory/

5. 在MDS和OSS上，将密钥文件/secure_directory/testfs.IustreServers.key可
靠地拷贝至/secure_directory/testfs.LustreServers.client.key中。
6.在每个服务器上将/secure_directory/testfs.lustreServers.client.key
的密钥类型更改client。此操作同时也生成了长度为 Prime length 的素数
以填充 Prime（p）属性，运行：
2 mds# lgss_sk -t client -m\
3 /secure_directory/testfs.LustreServers.client.key
4 oss# lgss_sk -t client -m\
5 /secure
_directory/testfs.LustreServers.client.key
7. 将密钥文件/secure_directory/testfs.Lustreservers.key和/secure_
directory/testfs.LustreServers.client.key 加载至 MDS 和 OSS 上
的密钥环上。
1 mds# lgss_sk -1 /secure_directory/testfs.IiustreServers.key
2 mds# lgss_sk -1 /secure_directory/testfs.LustreServers.client.key
3 oss# lgss_sk -1 /secure_directory/testfs.IiustreServers.key
4 oss# lgss_sk -1 /secure_directory/testfs.LustreServers.client.key
8. 将MDT至OST连接的安全特性特质为ski以保证数据完整性：

```bash
mds# lctl conf_param testfs.srpc.flavor.tcp.mdt2ost=ski
```
9. 确认 osc 和 osp 到OST的连接拥有可靠的ski 安全环境。．请参阅、29.7. 查看
PRPC 安全环境"。

### 29.7. 查看PtIRPC安全环境

从客户端（或具有 mgc,osc，mdc 环境的服务器）上，您可以导入文件查看所有用
户的密钥环境及使用中的安全特性。对于用户环境（srpc_context），SSK 和 gssnull仅支
持单个 root UID，因此只能有一个环境。导入的另一个文件（srpc_info）具有 sptlrpc 其
它详细信息。rpc和 bulk允许您确认哪些安全特性正在使用中。
1 client1# lct1 get_param *，*.srpC_*
2 mdc.testfs-MDT0000-mdc-ffff8800da9f0800.srpc_contexts=
3 ffff8800da9600c0:uid O, ref 2, expire 1478531769 （+604695），£1
uptodate, cached,seq 7, win 2048, key 27a24430 （ref 1），hdl
Oxf2020f47cbffa93d: Oxc23f4df4bcfb7be7, mech:sk

4 mdc.testfs-MDT0000-mdc-fff£8800da9f0800.srpc_info-
S rpc flavor：
skpi
6 bulk flavor：
skpi
7 flags：
rootonlyudesc，
8 id：
9 refcount：
10 nctx：
11 gc internal
12 gc next 3505
13 mgc.MGC172.16.0.1etcp.srpC_contexts=
14 Efff8800dbb09b40:uid O, ref 2, expire 1478531769（+604695），£1
uptodate, cached,seq 18, win 2048, key 3e3£709f （ref 1），hdl
Oxf2020f47cbffa93b:0xc23f4df4bcf7be6, mech: sk
15 mgc.MGC172.16.0.1@tcp.srpc_info-
16 rpc flavor：
skpi
17 bulk flavor：|
skpi
18 Elags：
19 id：
20 refcount：
21 nctx：
22 gc internal
23 gc next 3505
24 osc.testfs-OST0000-osc-ffff8800da9f0800.srpc_contexts=
25 Efff8800db9e5600: uid 0, ref 2, expire 1478531770 （+604696），E1
uptodate,cached,seq 3, win 2048, key 3f7c1d70 （ref 1），hdl
oxf93e61c64b6b415d:0xc23f4df4bcfb7bea, mech:sk
26 osc.testfs-OST0000-osc-ffff8800da9f0800.srpc_info-
27 rpc flavor：
skpi
28 bulk flavor：
skpi
29 flags：
rootonly,bulk，
30 id：
31 refcount：
32 nctx：
33 gc internal
34 gc next 3505、


## 第三十章 Lustre 文件系统安全管理


### 30.1.使用访问控制列表（ACL）

访问控制列表（ACL）是用于向操作系统通知每个用户或组对特定系统对象（如目
录或文件）的权限（或访问权限）的一组数据。每个对象都有一个唯一的安全属性，用
于标识有权访问它的用户。ACL 列出了每个对象和用户的访问权限，如读、写或执行。

### 30.1.1.ACL 如何工作

在不同的操作系统实现 ACL 有所不同。支持可移植操作系统接口（POSIX）系列
标准的系统共享一个简单但功能强大的文件系统权限模型，Linux/UNIX 管理员应该对
这个模型非常熟悉。ACL 将为此模型添加更细化的权限，形成更复杂的权限方案。有关
Linux 操作系统上 ACL 的详细说明，请参阅SUSE Labs 的文章Linux 上 Posix 的访问控
制列表。
我们根据这个模型来实施ACL。Lustre 软件可以与标准的 Linux ACL 工具，setfacl，
getfacl 以及历史 chacl（通常随 ACL 软件包一起安装）配合工作。
注意
ACL 是系统范围内的功能，这意味着所有客户端都将启用或不启用ACL。您无法
指定其中一部分客户端启用或不启用 ACL。

### 30.1.2. Lustre 软件上的ACLs

POSIX 访问控制列表（ACL）可以与Lustre 软件一起使用。一个 ACL 由代表权限
（基于标准POSIX文件系统对象权限）的文件条目组成，这些权限定义了三类用户（所
有者，组和其他）。每个类都与一组权限关联：读（r），写（w）和执行（x）。

- 所有者类定义文件所有者的访问权限。

- 组类定义组用户的访问权限。

- 其他类定义不在所有者类或组类的其它用户访问权限。
13 -1命令输出的第一列将显示所有者、组和其他类的权限（对于常规文件来说，
-W- --表示所有者拥有读取和写入权限，组用户拥有读取权限，其它用户无访问权限）。
最小 ACL 有三个条目，扩展 ACL 有三个以上的条目。扩展 ACL 还包含一个掩码
条目，并可能包含任意数量的指定用户和命名组条目。
配置 MDS 来启用 ACL，请在创建配置时使用--mountfsoptions：

```bash
1 S mkfs.lustre --fsname spfs --mountfsoptions-acl --mdt -mgs /dev/sda
```

```bash
您也可以在运行时使用mkfs.lustre命令和--ac1 选项来启用ACL：
```

```bash
1 S mount -t lustre -o acl /dev/sda /mnt/mdt
```

在 MDS 上查看 ACL：
I $ lct1 get_param -n mdc.home-MDT0000-mdc-*.connect_flags | grep acl acl
挂载不带 ACL的客户端：

```bash
1 S mount -t lustre -o noacl ibmds2@o2ib:/home /home
```
在Lustre 文件系统中，ACL 功能在系统范围内启用；要么所有客户端都启用 ACL，
要么都不启动。由MDS 挂载选项ac1 /noacl（启用/禁用 ACL）控制激活 ACL。客户
端挂载时，将忽略ac1/noac1选项。您不需要更改客户端配置，且'acl'字符串不会出现
在客户端/etc/mtab 中。如果使用了该选项装载客户端，则在 MDS 系统日志中将出现以
下消息提示：
1 •..MDS requires ACL support but client does not
该消息是无害的，但指示了应予以更正的配置问题。
如果 MDS上未启用 ACL，则在客户端上进行任何引用ACL 的尝试都会返回”不支
持操作"的错误。

### 30.1.3. 示例

这些示例来自上面引用的POSIX文件。Lustre 文件系统上ACL 的工作机制与任何
Linux 文件系统上的ACL 完全相同。它们通过标准工具以标准方式进行操作。我们在下
面创建了一个目录并允许特定的用户访问。
1 ［root@client lustre］ # umask 027
2 ［rootCclient lustrel # mkdir rain
3 ［root@client lustre］# 1s -ld rain
4 drwXr-X--- 2 root root 4096 Feb 20 06:50 rain
5 ［root@client lustre］ # getfacl rain
6 # file: rain
7 # owner: root
8 # group: root
9 user：：rwx
10 group：：r-X
11 other：：---
13 ［rootCclient lustre］# setfacl -m user:chirag:rwx rain
14 ［root@client lustre］# 1s -ld rain
15 drwxrwx---+ 2 root root 4096 Feb 20 06:50 rain
16 ［rootCclient lustre］# getfacl --omit-header rain

17 user：：rwx
18 user:chirag:rwx
19 group：：r-X
20 mask：：rwx
21 other：：---

### 30.2. 使用 Root Squash

Root Squash 是一种安全功能，它限制了超级用户访问Lustre 文件系统的权限。如果
未启用Root Squash 功能，则未授信任客户端上的Lustre 文件系统用户可以访问、修改，
甚至删除系统 root 用户的文件。使用 Root Squash 功能可以限定能够访问或修改 root 用
户文件的客户端。注意，这不会阻止未授信客户端上的用户访问其他用户的文件。
Root Squash 功能通过Lustre 配置管理服务器（MGS）将root用户的用户标识（UID）
和组标识（GID）重新映射到由系统管理员指定的 UID和 GID 来工作。Root Squash 功
能同时也允许 Lustre 文件系统管理员指定不适用于 UID/GID 重映射的一组客户端。
注意
Nodemaps（用 Nodemap 映射 UID 和GID）是root squash 的一种替代方案，因为它
也允许在每个客户端上进行 root squash。通过UID 映射，客户端甚至可以拥有一个本地
的root UID，而不需要实际拥有对文件系统本身的root 访问权限。

### 30.2.1.配置 Root Squash

Root Squash 由两种配置参数进行管理：root_squash,nosquash_nids。

- root_squash 参数用于指定 root 用户访问Lustre 文件系统使用的UID 和GID。

- nosquash_nids 参数用于指定不适用 Root Squash 的一组客户端，使用 LNet NID
范围的语法，如：
1 nosquash_ nids-172.16.245.［0-255/2］@tcp
在此示例中，Root Squash 不适用于子网172.16.245.0且IP地址最后一部分为偶数
的 TCP 客户端。

### 30.2.2. 启用和调试 Root Squash

nosquash
_nids 的默认值为 NULL，表明默认情况下 Root Squash 适用于所有客
户端。关闭 Root Squash，请将 root squash UID 和GID 设为0。

```bash
创建 MDT （mkfs.lustre
```
--mdt） 时可设置 Root Squash 参数，如：


```bash
1 mds# mkfs.lustre --reformat --fsname=testfs --mdt --mgs \
```
--param
"mdt.root_squash=500:501"\
--param "mdt.nosquash_nids-'oeelan1 192.168.1.［10,11］'" /dev/sdal
Root Squash 参数可在未挂载的设备上通过tunefs.lustre更改：
1 tunefs.lustre --param "mdt.root_squash-65534:65534"\
2 --param "mdt.nosquash_nids-192.168.0.138tcpo" /dev/sdal
Root Squash 参数也可通过1ct1 conf_param 命令更改，如：
I mgs# lct1 conf_param testfs.ndt.root_squash="1000:101"
2 mgs# lct1 conf_param testfs.mdt.nosquash
_nids="*etcp"
要检索当前的 root squash 参数设置，可以使用如下lct1 get_param命令：
1 mgs# lct1 get_param mdt.*.root_
_squash

```bash
2 mgs# lctl get pparam mdt.*.nosquash_nids
```
注意
使用1ct1 conf_param命令时，请谨记：

- lct1 conf_param 必须在活动 MGS上运行。

- Ict1 conf_param 将导致所有 MDSs上的参数发生改变。

- 运行一次lctl conf
_param只能更改一个参数。
Root Squash 设置也可以通过 lct1 set_param暂时改变，或者通过1ct1
set_param -P永久改变。例如：
1 mgs# lct1 set_param mdt.testfs-MDT0000.root._squash="1:0"
2 mgs# lct1 set_param -P mdt.testfs-DT0000.root_squash="1:0"
清除nosquash_nids列表：
1 mgs# lct1 conf_param testfs.mdt.nosquash_nids="NONE"
或：
1 mgs# lct1 conf_param testfs.ndt.nosquash_nids="clear"
nosquash_nids 包含了一些NID 范围（如：O@elan, 1@elan1），NID 范围列表
必须用单引号（）或双引号（）进行引用，每个值用空格分开，如：

```bash
1 mds# mkfs.lustre •.. --param "mdt.nosquash_nids='0@elanl 1@elan2'" /dev/sda1
```
2 1ct1 conf_param testfs.mdt.nosquash_nids-"24@elan 15gelan1"
以下是一些语法错误的例子：


```bash
I mds# mkfs.lustre •..--param "dt.nosquash_nids=0@elanl 1eelan2" /dev/sdal
```
2 lct1 conf_param testfs.ndt.nosquash_nids-24@elan 15gelan1
使用1ct1 get_param命令查看 Root Squash 参数：

```bash
1 mds# lctl get_param mdt.testfs-MDT0000.root_squash
```
2 1ct1 get_param mdt.*.nosquash_nids
注意
nosquash_nids列表为空，将返回 NONE。

### 30.2.3. 使用 Root Squash 的技巧

在 Lustre 配置管理中，Root Squash 功能在以下几个方面有所限制：

- lct1 conf_param 指定的值将覆盖参数先前的值。如果新值使用不正确的语法，
那么系统将继续使用旧的参数，但在重新挂载时之前正确的值将丢失。请谨慎调
试 Root Squash。

- mkfs.lustre 和 tunefs.lustre 不进行参数语法检查。如果 root squash 参数
错误，它们将在挂载时被忽略，系统将使用默认值。

- Root Squash 参数将通过严格的语法检查。root
_squash 参数应由
<decnum>：<decnum>指定。nosquash_nids 参数应遵循 LNet NID 范围的语
法。
LNet NID 范围的语法：
1 <idlist
：== <nidrange［''<nidrange ］
2 <nidrange：== <addrrange'@'<net
3 <addrrange：==1*' |
<ipaddr_range||
‹numaddr_range
6 <ipaddr_range
：==
7 <numaddr
_range.<umaddr_range.umaddr_range.numaddr_range
8 ＜numaddr_range
：== <number>〉 |
<expr_list
10 <expr_list>：=-'［'<range_expr ［'，'<range_expr］'］'
11 <range_expr> ：== <number> ||
<number>'-'〈number> |
<number>'-'〈number>'/'<number>
14 <net>
：== <netname〉 | <netname<number>

15 <netname
17 <number
：== “1o"| "tcp"| "o2ib"
| "ra" | "elan"
：=- <nonnegative decimal>| hexadecimal>
注意
对于使用数字地址的网络（如elan），地址范围必须由<numaddr_range>语法指
定。对于使用IP 地址的网络，地址范围必须由<ipaddr_range＞语法指定。例如，如
果elan 使用数字地址，则1.2.3.4@elan 是错误的。

### 30.3. 隔离客户端到子目录树上

Isolation（隔离）是通过 Lustre 多租户这一通用概念的实现，其目的在于从一个文
件系统中提供分离的命名空间。Lustre Isolation 使同一文件系统上的不同用户群体能够
超越正常的Unix 权限/ACL，即使客户端上的用户可能有 root 访问权限。这些租户共享
同一个文件系统，但他们相互之间是隔离的：他们不能访问甚至看不到对方的文件，也
不知道他们正在共享共同的文件系统资源。
Lustre Isolation 使用了 Fileset特性，只挂载文件系统的一个子目录，而不是根目录。
为了实现隔离，必须让客户端挂载子目录（只向租户展示自己的 fileset）。为此，我们使
用了 nodemap 功能（用nodemap 映射 UID 和GID）。我们将一个租户使用的所有客户端
归类到一个共同的 nodemap 条目下，并将该租户被限制的 fileset 分配给这个 nodemap 条
目。

### 30.3.1. 指定客户端

在Lustre 上强制执行多租户，依赖于能正确识别租户使用的客户端节点，并信任这
些节点的能力。这可以通过物理硬件和/或网络安全来实现，从而使客户端节点拥有众
所周知的 NID。还可以使用 Kerberos 或共享密钥，使用强认证。Kerberos 可以防止 NID
欺骗，因为每个客户端都需要基于其 NID 来连接到服务器。公私密钥还可以防止租户冒
充，因为密钥可以链接到特定的 nodemap。

### 30.3.2. 配置 Isolation

Lustre 上的 Isolation 可以通过在nodemap 条目上设置 fileset 参数来实现。所有属于
这个 nodemap 条目的客户端将自动挂载这个 fileset，而不是挂载root 目录。例如：
1 mgs# lct1 nodemap_set_fileset --name tenant1 --fileset '/dir1'
因此，所有匹配tenant1 nodemap 的客户端在挂载时都会自动显示/dir1的文件
集合 （fileset），表示这些客户端正在对子目录/dir1进行隐式子目录挂载。

注意如果文件系统中不存在定义为 fileset 的子目录，则会阻止任何属于 nodemap 的
客户端挂载 Lustre。
要删除 fileset 参数，只需将其设置內空字符串即可：
1 mgs# lct1 nodemap_set_fileset --name tenant1 --fileset ''

### 30.3.3. 将Isolation 持久化

为了使Isolation 持久化，必须使用带选项-P的1ct1 set_param 来设置 nodemap
上的 fileset 参数。

```bash
I mgs# lctl set_param nodemap.tenant1.fileset=/dir1
```
2 mgs# lct1 set_param -P nodemap.tenant1.fileset=/dir1
这样，fileset 参数将被存储在 Lustre 配置的日志中，供服务器重启后获取该信息。

### 30.4. 检查 Lustre 客户端执行的 SELinux 策略

SELinux 在 Linux 中提供了一种支持强制访问控制（MAC）策略的机制。当 MAC
策略被强制执行时，操作系统的内核就会定义应用的权限，使应用不会危及整个系统。
普通用户没有能力使该策略失效。
SELinux 的一个目的是保护操作系统不受权限升级的影响。为此，SELinux 为进程
和用户定义了受限域和非受限域。每个进程、用户、文件都被分配了一个安全环境，规
则定义了进程和用户对文件允许执行的操作。
SELinux 的另一个目的是保护数据的敏感性，这要归功于多级安全（MLS）功能。
MLS 是在SELinux 的基础上，通过定义域之外的安全级别概念发挥作用。每个进程、用
户和文件都被分配了一个安全级别，且该模型规定，进程和用户可以读取与自己相同或
更低的安全级别的数据，但只能写入与自己相同或更高的安全级别的数据。
从文件系统的角度来看，文件的安全环境必须持久存储。Lustre 利用文件上
的security.selinux扩展属性来存储这些信息。Lustre 在客户端支持 SELinux。要在
Lustre上实现MAC和 MLS，需要做的就是在所有 Lustre 客户端上执行适当的SELinux
策略（由Linux 发行版提供）。Lustre 服务器上不需要 SELinux 策略。
因为 Lustre 是一个分布式文件系统，所以使用 MLS 的特殊性在于，Lustre 确实需
要确保数据总是被节点访问，并正确执行 SELinux MLS 策略。否则，数据就无法得到保
护。这意味着 Lustre 必须检查 SELinux 是否在客户端正确执行了 SELinux 策略，并且是
正确的、未被修改的策略。而如果 SELinux 在客户端没有按预期执行该策略，服务器会
拒绝其访问 Lustre。


### 30.4.1. 确定 SELinux 策略信息

服务器使用一个代表 SELinux 状态信息的字符串作参考，以检查客户端是否正确地
执行 SELinux 策略。这个参考字符串可以通过在已知执行正确的 SELinux 策略的客户端
节点上调用1_getsepo1命令行工具获得。
1 client# 1_getsepol
2 SELinux status info：
1:mls:31:40afb76d077c441b69af58cccaaa2ca63641ed6e21b0a887dc21a684£508b78f
描述 SELinux 策略的字符串的语法如下。
1 mode:name:version:hash
其中：

- mode 表示一个数字，告诉 SELinux 是在 Permissive 模式（0） 还是强制模式（1）下执
行。

- name 表示 SELinux 策略的名称。

- version 表示 SELinux 策略的版本。

- hash表示计算出的策略的二进制表示的哈希值，
从/etc/selinux/name/policy/policy/policy. version中导出。

### 30.4.2. 执行 SELinux 策略检

可以通过在 nodemap 条目上设置sepo1 参数来执行 SELinux 策略检查。所有属于
这个 nodemap 条目的客户端必须执行该参数描述的 SELinux 策略，否则将被拒绝访问
Lustre 文件系统。例如：
I mgs# lct1 nodemap_set_sepol --name restricted
--sepol
'1:mls:31:40afb76d077c441b69af58cccaaa2ca63641ed6e21b0a887dc21a684£508b78f'
因此，
所有
匹配restricted
nodemap
的客户
端必须执行
SELinux 策
略，
该策略的描述匹
配1:mls:31:40afb76d077c441b69af58ccca2ca63641ed6e21b0a887dc21a684f508b78f.
如果不匹配，当试图挂载或访问 Lustre 文件系统上的文件时，会得到Permission
Denied的提示。
要删除sePo1参数，只需将其设置为空字符串即可。
1 mgs# lct1 nodemap_set_sepol --name restricted --sepol '


### 30.4.3. 持久化 SELinux策略检查

为了持久化 SELinux 策略检查，必须使用1ct1 set_param的-P选项来设置
nodemap 上的sepo1参数。
1 mgs# lct1 set_param
nodemap.restricted.sepol=1:mls:31:40afb76d077c441b69af58cccaaa2ca63641ed6e21b0a887dc21a68
2 mgs# lct1 set_param -P
nodemap.restricted.sepol=1:mls:31:40afb76d077c441b69af58cccaaa2ca63641ed6e21b0a887dc21a68
这样，sepo1参数将被存储在 Lustre 配置日志中，供服务器在重启后获取该信息。

### 30.4.4. 客户端发送SELinux 状态信息

为了让 Lustre 客户端能够发送 SELinux 状态信息，在本地启用 SELinux，
send_sepo1 ptlpe 内核模块的参数必须设置为非零。send_sepo1可以设置为以
下值：

- 0：不发送 SELinux 策略信息。

- -1：每次请求都会获取 SELinux 策略信息。

- N>0：每隔N秒只获取 SELinux 策略信息。设置N=2~31-1 则只在挂载时获取
SELinux 策略信息。
在定义了sepo1的 nodemap 中的客户端必须发送SELinux状态信息。而且他们执
行的 SELinux 策略必须与存储在nodemap 中的策略相匹配。否则它们将被拒绝访问
Lustre 文件系统。

### 30.5 加密文件和目录

对客户端加密是希望能够为每个用户提供一个特殊的目录，安全地存储敏感文件。
其目的是保护在客户端和服务器之间传输的数据，并保护静止的数据。
该功能直接在 Lustre 客户端级实现。Lustre 客户端加密依赖于内核fscrypt。
fscrypt是一个库，文件系统可通过它支持文件和目录的透明加密。因此，下面描述的
关键内容是从fscrypt文档中摘出的。
对于更多完整的细节，请参考 Lustre源代码中
的Documentation/client_side.
encryption目录下的文档。
注意 客户端加密功能在运行着5.4以上版本的内核的 Linux 发行版的 Lustre 客户
端上是可用的。由于 Lustre 提供了一个另外色内核库，因此它也可以在运行支持基本加
密的 Linux 发行版的客户端上使用，包括：


- CentOS/RHEL 8.1 及以上版本；

- Ubuntu 18.04及以上版本；

- SLES 15 SP2及以上版本。

### 30.5.1.客户端加密访问语义

仅有 Lustre 客户端需要访问加密主密钥。密钥添加到 Lustre 客户端的文件系统级加
密密钥圈中。

- 有密钥有了加密密钥，加密的普通文件、目录和符号链接的行为与未加密的对应
文件非常相似一毕竞，加密预期是透明的。然而，细心的用户可能会注意到行为
上的一些差异。

- 未加密的文件，或用不同的加密策略（即不同的密钥、模式或标志）加密的文件，
不能进行重命名或链接到一个加密的目录。但加密文件可以在加密目录中重命名，
或链接到未加密的目录中。注意
将一个未加密的文件“移动”到一个加密的目录中，如通过mv命令，在用户空间是
通过复制和删除来实现的。请注意，原始的未加密数据可能仍然可以从磁盘上的
空闲空间中恢复；最好从一开始就保持所有文件加密。

- 在 Lustre 上，加密的文件支持直接1/O。

- fallocate （）操
作FALLOC_FL_COLLAPSE_RANGE，
FALLOC_FL_INSERT
'_RANGE和 FALIOC_FL_ZERO_RANGE不支持加密文
件，并且会以 EOPNOTSUPP 失败。

- 加密文件不支持DAX（直接访问）。

- 支持mmap。这是有可能的，因为加密文件的分页缓存包含明文，而不是加密文本。

- 无密钥无密钥时（包括添加加密密钥之前，或删除加密密钥被之后），一些文件系
统的操作仍可以在加密的普通文件、目录和符号链接上进行：

- 可读取文件元数据，如使用 stat（）。

- 可列出目录，包括整个命名空间树。

- 可删除文件。非目录的文件可以像往常一样使用 unlink（删除，而空目录可以像往
常一样用rmdir0 删除。因此，rm和rm-t将按预期工作。

- 可读取和跟踪Symlink 目标，但它们将以加密的形式呈现，类似于目录中的文件
名。因此，它们不太可能呈现出所有有用的目标。

无密钥时无法打开或截断普通文件，试图这样做将以 ENOKEY 失败。这意味着任
何需要文件描述符的常规文件操作，如read（、write（）、mmapO、fallocate（）和 ioctl（），都
被禁止了。
同样，如果没有密钥，则无法在加密目录中创建或链接任何类型的文件（包括目
录），加密目录中的名字也不能成为重命名的来源或目标，也不能在加密目录中创建
O_TMPFILE 临时文件。所有这些操作都会因为 ENOKEY 而失败。
目前不可能在没有加密密钥的情况下备份和恢复加密的文件。这需要特殊的API，
目前还没有实现。

- 加密策略的执行在一个目录上设置了加密策略后，在该目录（递归子目录）中创
建的所有普通文件、目录和符号链接都将继承该加密策略。但不加密特殊文件
—---即命名的管道、设备节点和 UNIX 域套接字。
除了这些特殊文件，禁止在加密的目录树中有未加密的文件或使用不同加密策略加
密的文件。

### 30.5.2. 客户端加密密钥的层次结构

每个加密目录树都受到一个主密钥的保护。
要“解锁"一个加密目录树，用户空间必须提供恰当的主密钥。可以有任意数量的
主密钥，每个主密钥保护任意数量文件系统上的任意数量的目录树。

### 30.5.3. 客户端加密模式和用法

fscryPt允许为文件内容指定一种加密模式，为文件名指定另一种加密模式。不同
的目录树允许使用不同的加密模式。
目前，支持以下几对加密模式：

- 内容为 AES-256-XTS，文件名为 AES-256-CTS-CBC

- 内容力 AES-128-CBC，文件名为 AES-128-CTS-CBC
如果不确定使用哪种模式，则应该使用（AES-256-XTS，AES-256-CTS-CBC）对。
警告 在 Lustre 2.14中，客户端加密只支持内容加密，而不是文件名加密。因此，
只有内容加密模式会被识别并执行，而文件名加密模式会被忽略，从而使文件名成为明
文。

### 30.5.4. 客户端加密威胁模式


- 离线攻击对于 Lustre，块设备是连接到 Lustre 服务器的 Lustre 目标。离线操纵文
件系统意味着在 Lustre 离线时访问这些目标上的文件系统。当块设备内容在某一

时间点永久离线的情况下，只要选择了一个强加密密钥，则Escrypt可以护文件
内容的机密性。Lustre 客户端加密并不能保护元数据的机密性，如文件名、文件大
小、文件权限、文件时间戳和扩展属性。另外，也无法保护文件中的洞（逻辑上
包含所有零的未分配块）的存在及位置。

- 在线攻击

- 在 Lustre 客户端
添加了加密密钥后，fscrypt并不对同一节点上的其他用户隐藏明文文件内容或
文件名，而现有的访问控制机制（如文件模式位、POSIX ACLS、LSMs或命名空
间）应提供隐藏功能。
对于Lustre，这意味着明文文件内容或文件名不会对同一Lustre 客户端的其他用
户隐藏。
攻击者如果破坏了系统（如利用内核的安全漏洞），足以从任意内存中读取，则可
以破坏当前使用的所有加密密钥。然而，Escrypt允许将加密密钥从内核中移除，
从而保护它们不被破坏。非root 用户也可以进行密钥移除操作。更确切地说，密
钥移除将从内核内存中擦除主加密密钥。另外，它还将尝试驱逐所有使用该密钥
“解锁"的缓存节点，从而擦除它们的每个文件的密钥，并使它们再次被“锁定"，
即以密码文本或加密的形式出现。

- 在 Lustre 服务器上
如果是 Lustre 服务器上的攻击者破坏了系统（如利用内核安全漏洞），虽然足以读
取任意内存，但无法获取Lustre 文件内容。事实上，加密密钥不会被转发给 Lustre
服务器，服务器也不会进行解密或加密。此外，服务器收到的批量 RPC 包含加密
的数据，被原封不动地写入底层文件系统中。### 30.5.5.管理目录上的加密默认情
况下，Lustre 客户端加密是启用的，让用户在每个目录的基础上定义加密策略。
注意 管理员可以通过指定noencrypt客户端挂载选项来阻止 Lustre 客户端挂载
点使用加密功能，且服务端可以通过 nodemap 上的forbid_encryption属性强制执
行这一功能。请参考第28.2 章节〝修改属性"，了解如何管理 nodemap。
用户空间工具fscrypt可以用来管理加密策略。参见 https://github.com/google/
fscrypt，了解全面的说明。下面是关于如何在Lustre 中使用这个工具的例子。如果没有
特别说明，则必须在 Lustre 客户端运行命令。

- 在实际决定哪些目录要加密之前，需要两个准备步骤，这是唯一需要 root 权限的
功能。管理员必须运行：
1 # fscrypt setup

2 Customizing passphrase hashing difficulty for this system...
3 Created global config file at "/etc/fscrypt.conf".
4 Metadata directories created at "/ .fscrypt".
这第一条命令必须在所有想要使用加密的客户端上运行，因为它在 Lustre 之外设
置了全局 fscrypt 参数。
1 fscrypt setup /mnt/lustre
2 Metadata directories created at "/mnt/lustre/.fscrypt"
这第二条命令必须只在一个 Lustre 客户端上运行。
注意 可以编辑文件/etc/fscryPt.conf。强烈建议将policy_version设置
为2，这样当删除加密密钥时，fscryPt就会从内存中清除文件。

- 现在一个普通用户能够选择一个目录进行加密：

```bash
$ fscrypt encrypt /mnt/lustre/vault The following
```
protector sources are available: 1 - Your login passphrase
（pam_passphrase） 2 - A custom passphrase （custom_passphrase） 3
-A raw 256-bit key （raw_key）Enter the source number for
the new
protector ［2 - custom_passphrasel: 2 Enter a name
for the new protector: shield Enter custom passphrase for
protector "shield"： Confirm passphrase："/mnt/1ustre/vault"
is now encrypted, unlocked, and ready for use. 从这条命令之后，
在/mnt/1ustre/vault下创建的所有文件和目录都将（根据前面步骤中定义的策略）
被加密。
注意 加密策略会被所有子目录继承。无法改变一个子目录的策略。

- 另一个用户可以决定用自己的保护器对不同的目录进行加密：$
fscrypt encrypt /mnt/lustre/private Should we create a
new protector？ ［y/N］ Y The following protector sources are
available: 1 - Your login passphrase （pam_passphrase）2- A
custom passphrase （custom_passphrase） 3 - A
Iaw
256-bit key
（raw_key）Enter the source number for the
new protector
［2 - custom passphrase］： 2 Enter a name for the new
protector: armor Enter custom passphrase for protector
"armor" ： Confirm passphrase："/mnt/lustre/private" is
nOw
encrypted,unlocked, and ready for use.


- 用户可以在任何时候决定锁定一个加密的目录：$Escrypt 1ock
/mnt/lustre/vault "/mnt/lustre/vault" is now locked. 这个动作
可以防止对加密内容的访问，或通过从内存中删除密钥。如果该文件还没有打开，
也会从内存中擦除。

- 用户可以通过以下命令重新获得对加密目录的访问：$fscrypt unlock
/mnt/lustre/vault Enter custom passphrase for protector
"shield"："/mnt/lustre/vault" is now unlocked and ready
for use•

- 实际上，Escrypt并不直接访问主密钥，而是访问用于加密
的保护器。这种机制提供了改变口令的能力：$ fscrypt
status /mnt/lustre lustre filesystem "/mnt/lustre"
has 2 protectors and 2 policies PROTECTOR LINKED
DESCRIPTION deacab807bf0e788 No custom protector "shield"
e691ae7a1990fc2a No custom protector "armor"POLICY
UNLOCKED PROTECTORS 52b2b5aff0e59d8e0d58f962e715862e
No deacab807bf0e788 374e8944e4294b527e50363d86fc9411 No
e691ae7a1990fc2a $ fscrypt metadata change-passphrase
--protector=/mnt/lustre:deacab807bf0e788 Enter old custom
passphrase for protector "shield"： Enter new custom
passphrase
for protector "shield" ： Confirm passphrase：
Passphrase for protector deacab807bf0e788
sucCessful1y
changed.这可以为同一策略设置多个保护器。当几个用户共享一个加密目录时，
这非常有用，因为它避免了在他们之间共享任何秘密。$ fscrypt status
/mnt/lustre/vault "/mnt/1ustre/vault" is encrypted with
fscrypt. Policy: 52b2b5aff0e59d8e0d58f962e715862e Options：
padding:32 contents: AES_256_XTS filenames:AES_256_CTS
policy_version:2 Unlocked: No Protected with 1
protector: PROTECTOR LINKED DESCRIPTION deacab807bf0e788
No custom protector "shield" s fscrypt metadata
create protector /mnt/lustre Create new protector on
"/mnt/lustre"［Y/n］ Y The following protector sources are
available: 1 - Your login passphrase （pam_passphrase） 2
- A custom passphrase （custom_passphrase） 3 -A raw
256-bit key（raw_key）Enter the source number for
the new protector ［2 - custom_passphrase］：2 Enter
a name for the new protector: bunker Enter custom

passphrase for protector "bunker" ： Confirm passphrase：
Protector f3cc1b5cf9b8f4lc created on filesystem
"/mnt/lustre". s fscrypt metadata add-protector-to-policy
--protector=/mnt/lustre:f3cclb5cf9b8f41c
--policy=/mnt/lustre: 52b2b5aff0e59d8e0d58f962e715862e
WARNING:A11 files using this policy will be
accessible with this protector Protect policy
52b2b5aff0e59d8e0d58f962e715862e with protector
f3cclb5cf9b8f41c？ ［Y/n］ Y Enter custom passphrase for
protector "bunker" ： Enter custom passphrase for protector
"shield"： Protector f3cclb5cf9b8f4lc now protecting
policy 52b2b5aff0e59d8e0d58f962e715862e.$ fscrypt status
/mnt/lustre/vault "/mnt/1ustre/vault" is encrypted with
fscrypt. Policy: 52b2b5aff0e59d8e0d58f962e715862e Options：
padding:32 contents: AES_256_XTS filenames:AES_256_CTS
policy_version:2 Unlocked: No Protected with 2 protectors：
PROTECTOR LINKED DESCRIPTION deacab807bf0e788 No custom
protector "shield" f3cc1b5cf9b8f41c No custom protector
"bunker"

### 30.6 配置 Kerberos （KRB） 安全性

本章介绍如果在 Lustre 中使用 Kerberos。

### 30.6.1.什么是 Kerberos？

Kerberos 是一种验证“不安全网络上所有实体（如用户和服务器）的机制。每一
个实体（也称次“委托人"）与Kerberos 服务器协商一个运行时密钥。这个密钥使委托
人能够验证来自 Kerberos服务器的信息是真实的。通过信任的Kerberos 服务器，用户和
服务可以互相认证。
使用Kerberos设置Lustre 可以为Lustre 网络提供高级安全保护。广义上讲，Kerberos
提供了三种类型的保护：

- 允许 Lustre 连接对等体（MDS、OSS 和客户端）相互认证。

- 保护 PTLRPC消息的完整性，防止在网络传输过程中被修改。

- 保护PTLRPC 消息的隐私，防止在网络传输期间被窃听。
Kerberos 使用〝内核钥匙圈"客户端向上调用机制。


### 30.6.2. 安全类型 （Security Flavor）

安全类型是一个字符串，用于描述在PTLRPC连接上执行什么样的认证和数据转
换，包括RPC消息和批量数据。下表描述了支持的类型：
基础类型 认证
RPC 消息保护
批量数据保护说明
null
krbSn
N/A
N/A
GSS/Kerberos5 null
N/A
校验和
krbSa
GSS/KerberosS 部分完整性保护 校验和
（krb5）
Krbsi
Krbsp
GSS/Kerberos5 完整性保护
（krb5）
GSS/Kerberos5 隐私保护
（krb5）
完整性保护
（krb5）
隐私保护
（krb5）
不对RPC消息进行保护，对批量数据进行
校验保护，性能开销较小。
对RPC消息头部进行完整性保护，对批量
数据进行校验保护，与krbSn 相比，性能
开销更大。
转化算法由 KDC 和委托人强制执行的实际
Kerberos 算法决定；性能损失很大。
转换隐私保护算法是由KDC 和委托人执行
实际 Kerberos 算法决定的；最大的性能损今

### 30.6.3. Kerberos设置


### 30.6.3.1.版本 Lustre（从1.3版本开始）只支持 MIT Kerberos 5。

关于一般的环境要求，尤其是时钟同步，请参考第8.1.2 章节〝环境要求”。

### 30.6.3.2. 原理配置


- 配置客户端节点：

- 对于每个客户节点，创建一个 lustre_root principal 并生成 keytab。
1 kadmin addprinc -randkey lustre_root/client_host.domain@REAIM
2 kadmin ktadd lustre_root/client_host.domainCREAIM

- 在客户端节点上安装 keytab。

- 配置 MGS 节点：

- 对于每个 MGS 节点，创建一个 lustre_mgs principal 并生成 keytab。

1 kadnin addprinc -randkey lustre_mgs/ngs_host.domain@REAIM
2 kadmin ktadd lustre_mds/mgs_host.domainCREALM

- 在 MGS 节点上安装 keytab。

- 配置 MDS 节点：

- 对于每个 MDS 节点，创建一个 lustre_mds principal 并生成 keytab。
1 kadmin addprinc -randkey lustre_mds/mds_host.domainCREAIM
2 kadnin ktadd lustre_mds/nds_host.domaineREAIM

- 在 MDS 节点上安装 keytab。

- 配置 OSS 节点：

- 对于每个 OSS 节点，创建一个 lustre_oss principal 并生成 keytab。
1 kadmin addprinc -randkey lustre_oss/oss_host.domain@REAIM
2 kadmin ktadd lustre_oss/oss_host.domainCREAIM

- 在客户机节点上安装 keytab。
注意
- host.domain应该是您网络中的FQDN，否则服务器可能无法识别任何GSS
请求。
- 作为客户端keytab 的替代方案，如果你想省去为每个客户端节点分配唯一
keytab 的麻烦，则可以创建一个通用的lustre_root 委托人和它的keytab，并在
你想要的许多客户端节点上安装相同的keytab。请注意，在这种方式下，一
个客户端被攻击则意味着所有客户端都不安全。
kadmin>addprinc -randkey lustre_rooteREAIM kadmin> ktadd
lustre_root@REAIM

- Lustre 支持 MIT Kerberos 5 1.3或更高版本的以下 enctypes：
- aes128-cts
- aes256-cts


### 30.6.4.网络

在一个如TCP 或InfniBand 等可以将名称解析为IP 地址的网络上，在委托人中使
用的名称必须可以解析为 Lustre NID 使用的IP地址。
如果您使用的网络不是TCP 或InfiniBand（例如 PTL4LND），则每个节点上都需要
有一个/ etc/lustre/nid2hostname脚本，其目的是将NID 翻译成主机名。以下是
PTL4LND 可能会用到的一个示例：
1 #！/bin/bash
2 set -x
3#用三个参数调用：1nd netid，可将的转换为主机名，nidINDNID
4 # 是字符串$1nd"PTLAIND等等"
5 # 是十六进制字符串格式的网络标识符Snetid
6 # 是十六进制格式的SnidNID
7 #输出相应的主机名，或由'@开头的错误信息，用于错误记录。'
8 lnd=$1
9 netid=$2
10# 将十六进制号码转换为十进制NID
11 nid=$ （ （0x$3））
12 case $lnd in
13 PTLAIND） ＃ 只需在开头添加'node即可'
14 echo "nodeSnid"
15；i
16 *）
17 echo "@unknown LND： $1nd"
18 ii
19 esac

### 30.6.5. 必要的软件包

每个节点都应该安装以下软件包：

- krb5-workstation

- krb5-libs

- keyutils

- keyutils-libs
在用于构建支持 GSS的 Lustre 的节点上，应该安装以下软件包：


- krb5-devel

- keyutils-libs-devel

### 30.6.6. 构建 Lustre

在配置时启用 GSS：
1 ./configure --enable-gss --other-options

### 30.6.7.运行


### 30.6.7.1.GSS 守护进程 在启动Lustre 之前，请确保在每个服务器节点（MGS、MDS

和OSS）上启动守护进程1svcgssd。命令的语法是：
1 1svcgssd ［-f］ ［-v］ ［-g］ ［-m］ ［-o］ -k|

- -f：在前台运行，而非作为守护程序运行

- -V：增加1个日志的详细程度。例如，要将详细程度设置为3，则运行'svcgssd
-v。详细的日志记录可以帮助你确定 Kerberos 的设置是否正确。

- -g：服务 MGS

- -m：服务 MDS

- -o：服务 OSS

- -k：启用 Kerberos 支持

### 30.6.7.2. 设置安全类型 安全类型可以通过在MGS上定义sptlrpe 规则来设置。这些规

则是持久性的，其形式为：<spec>=<flavor>。-添加一个规则：
mgs> lct1 conf_param <spec>=<flavor>
如果<spec>上已经存在一个现有的规则，则将被新规则覆盖。

- 删除一个规则：
- mgs> lct1 conf_param -d <spec>

- 列出现有的规则：
msg> lct1 get_param mgs.MGS.live.<fs-name> | grep
"srpc.flavour"
注意

- 如果没有指定任何东西，默认情况下所有RPC连接将使用nu11类型，这意味着没
有安全性。


- 在你改变规则之前，确保受影响的节点已经准备好接受新的安全风味。例如，如
果你把规则从 null 改为 krbSp，但GSS/Kerberos 环境没有正确地但在受影响的节
点上没有正确配置 GSS/Kerberos环境，这些节点可能会被驱逐，因为它们不能互
相通信。彼此之间的通信。

- 在改变规则后，通常需要几分钟时间将新规则应用到所有节点，时间长短取决于
全局系统的负载。

- 在改变规则之前，确保受影响的节点已经准备好接受新的安全类
型。例如，如果你把类型从nu11改为krb5P，但在需要改变的节点上没
有正确配置 GSS/Kerberos 环垸，那么这些节点可能会被驱逐，因为它
们之间无法相互通信。####30.6.7.3. 规则的语法和示例一般的语法是
<target>.srpc.flavor.<network>［.<direction>］=flavor

- <target>可以是文件系统名称，或特定的MDT/OST设备名称。例如，testfs、
testfs-MDT0000、testfs-OST0001。

- <network>是 LNet 网络名称，例如 tcpO、o2ibo，或者为在LNet 网络默认
为default。

- <direction>可以是 cli2mdt, cli2ost, mdt2mdt, mdt2ost 之一。方向是可选的。
示例：

- 在文件系统testfs的所有连接上应用krb5i：
1 mgs lct1 conf_param testfs.srpc.flavor.default-krb5i

- 网络tcpO 中的节点使用krbSp；所有其他节点使用 null。mgs>
Lctl
conf_param testfs.srpc.flavor.tcpO=krb5P mgs> 1ct1
conf_param testfs.srpc.flavor.default=nu11

- 网络 tcpo 中的节点使用krbSp；o2ib0 中的节点使用 krbSn；在
其他节点中，客户端连接到 MIDT/ OST 使用krbSi,MDT 到其他
MDT 使用 null,MDT 到 OST 使用krb5a。 mgs> lct1 conf_param

```bash
testfs.srpc.flavor.tcp0=krb5p mgs> lctl conf_param
```
testfs.srpc.flavor.o2ib0=krb5n mgs> lct1 conf_param
testfs.srpc.flavor.default.cli2mdt=krb5i mgs> lctl
conf_param testfs.srpc.flavor.default.cli2ost=krb5i mgs>

```bash
lctl conf
```
_param testfs.srpc.flavor.default.ndt2mdt=nu11
mgs> lct1 conf_param testfs.srpc.flavor.default.mdt2ost=krb5a


### 30.6.7.4. 普通用户认证 在客户端节点上，非root 用户在访问 Lustre 之前需要发

布kinit，就像其他 Kerberized 应用一样。

- 按照 Kerberos 的要求，用户的委托人（username@REALM） 应该添加到 KDC中。

- 客户端和 MIDT 节点应该有相同的用户数据库，用于名称和 uid/gid 转换。
普通用户可以在注销前销毁已建立的安全上下文，方法是执行以下命令：
1 lfs flushctx -k -r mount point
这里-k是销毁磁盘上的 Kerberos 凭证缓存，类似于kdestroy，而-工可在刷新GSS
上下文时，从密钥环中获取被撤销的密钥。否则，它只销毁了内核内存中已建立的上下
文。

### 30.6.8.安全的MGS连接

每个节点可以通过使用mgssec=flavor 挂载选项指定连接到 MGS 的安全类型。
一旦选择了一种类型，在重新挂载之前不能改变。
因为一个 Lustre 节点只有一个到MGS的连接，如果节点上有一个以上的目标或客
户端，则它们必然使用与MGS相同的安全模式，即在建立与MGS的第一个连接时执行
的模式。
默认情况下，MGS接受任何类型的 RPC。但也可以将 MGS 配置为只接受一个给
定类型。其语法与第30.6.7.3 章节〝规则语法和示例”中的说明相同，但使用特殊的目
标_mgs：
1 mgs> lct1 conf_param.
_mgs.srpc. favour. <network>=<flavor>

## 第三十一章 Lustre ZFS 快照


### 31.1.概述

快照能够快速从先前创建的检查点恢复文件，而无需借助脱机备份或远程副本。快
照还提供了存储的版本控制，用于恢复丢失的文件或之前不同版本的文件。
文件系统快照应挂载在用户可访问的节点上（如登录节点），以便用户在无需管理
员干预的情况下恢复文件（在意外删除或覆盖之后）。用户访问时，可以自动挂载快照
文件系统而不是挂载所有快照，从而降低登录节点的开销（当快照不在使用中）。
从快照恢复丢失的文件通常比从任何脱机备份或远程副本进行恢复要快得多。请注
意，快照并不会提高存储可靠性。与其他任何存储阵列一样，快照无法防御硬件故障。


### 31.1.1. 需求

所有 Lustre 服务器目标必须是运行 Lustre 2.10或更高版本的ZFS文件系统。此外，
MGS 必须能够通过ssh 或其他远程访问协议与所有服务器进行通信，无需密码验证。
该功能默认为启用状态，且不能禁用。快照的管理通过MGS上的1ct1命令完成。
Lustre 快照基于 Copy-On-Write，快照和文件系统在文件系统上的文件发生更改前
可能共享数据的同一副本。直到引用这些文件的快照被删除，存放已删除或已覆盖文件
的空间才会被释放。文件系统管理员需要根据系统的实际大小和使用情况建立快照的创
建、备份、删除策略。

### 31.2. 配置

快照工具从MGS上的/etc/1dev.conf 文件载入系统配置，调用相关 ZFS 命令
来维护所有目标（MGS/MDT/OST）的Lustre 快照。请注意，/etc/1dev.conf 文件还
有其他用途。
文件的格式为：
1 <host foreign/-<label><device ［journal-pathl /- ［raidtab］
的格式力：
1 fsname-<role><index> or <role<index
的格式为：
1 ［mdl zfs：］［pool
-dir/1<pool>/<filesystem
快照只使用域、和。
示例如下：
1 mgs# cat /etc/ldev.conf
2 host-mdt1 - myfs-MDT0000 zfs:/tmp/myfs-mdt1/mdt1
3 host-mdt2 - myfs-MDT0001 zfs:myfs-mdt2/mdt2
4 host-ost1 - OST0000 zfs:/tmp/myfs-ost1/ost1
5 host-ost2 - OST0001 zfs:myfs-ost2/ost2
配置文件是手动编辑的。当配置文件更新为当前最新的文件系统设置，您可以开始
创建文件系统快照。

### 31.3. 快照操作


### 31.3.1.创建快照

创建现有 Lustre 文件系统的快照，在 MGS上运行以下lct1命令：

1 lct1 snapshot_create ［-b | --barrier ［on | off］ ［-c | --comment
2 comment］ -F | --fsname fsname ［-h | --helpl -n | --name ssname
3 ［-r | --rsh remote_shel1］ I-t |--timeout timeout］
选项
说明
-b
-c
-F
-h
-n
-r
在创建快照之前设置写屏障。默认值是'on'。
快照目的说明
文件系统名
帮助信息
快照名
用于与远程目标进行通信的远程外壳。默认值是'ssh'。
写屏障的时间周期。默认值是30秒。

### 31.3.2.删除快照

删除现有 snapshot，在MGS上运行 lct1命令：
1 lct1 snapshot_destroy ［-f | --force］ <-F | --fsname fsname
2 <-n | --name ssname〉 ［-r | --rsh remote_she11］
选项说明
-£
-F
-h
-n
-r
暴力销毁快照
文件系统名
帮助信息
快照名
用于与远程目标进行通信的远程外壳。默认值是'ssh'。

### 31.3.3. 挂载快照

快照被视为单独的文件系统，可以在Lustre 客户端上挂载，但必须使用-。ro选项
将快照文件系统挂载为只读文件系统。如果mount选项不包含该只读选项，将导致挂载
失败。

注意
在客户端上挂载快照之前，必须使用lct1工具将先在服务器上挂载快照。
在服务器上挂载快照，请在MGS上运行 1ct1命令：
1 lct1 snapshot_mount <-F | --fsname fsname ［-h |--help］
2 <-n | --name ssname［-r | --rsh remote_ she11］
选项说明
-F
-h
-n
-r
文件系统名
帮助信息
快照名
用于与远程目标进行通信的远程外壳。默认值是'ssh'。
成功在服务器上挂载快照后，客户端便可以将快照挂载为只读文件系统。例如，要
为名为 myfs 的文件系统装入名次snapshot_20170602 的快照，使用以下挂载命令：

```bash
1 mgs# lctl snapshot._mount -F myfs -n snapshot_20170602
```
服务器上的快照挂载完成后，使用1ct1 snapshot_1ist返回快照的文件系统
名：
1 ss_fsname-$（Ict1 snapshot_list -F myfs -n snapshot._20170602 ||
awk'/^snapshot_fsname/ ｛ print $2 ｝'）
最后，在客户端上挂载快照：

```bash
1 mount -t lustre -O ro SMGS_nid: /Sss_fsname $local_mount_point
```

### 31.3.4.卸载快照

要从服务器卸载快照，首先在每个客户端上使用标准的umount命令从所有客户端
卸载快照文件系统。例如，要卸载名为snapshot_20170602的快照文件系统，请在所有
挂载了它的客户端上运行以下命令：
1 client# umount $local_mount_point
所有客户端完成快照文件系统卸载后，在挂载快照的服务器节点上运行以下1ct1命
令：
1 1ct1 snapshot_umount ［-F | --fsname fsname］ ［-h | --help］
2 <-n | -- name ssname〉［-r | --rsh remote_shel1］

选项 说明
-F
-h
-n
文件系统名
帮助信息
快照名
-r
用于与远程目标进行通信的远程外壳。默认值是'ssh'。
例如：
1 lct1 snapshot_unount -F myfs -n snapshot._20170602

### 31.3.5.列出快照

列出给定文件系统的可用快照，请在 MGS上运行以下lct1命令：
1 1ct1 snapshot_list ［-d | --detai1］ <-F | --fsname fsname
2 ［-h | -- help］ ［-n | --name ssname］ ［-r | --rsh remote_shel1］
选项 说明
-d
列出指定快照的各部分
-F
文件系统名
-h
帮助信息
-n
快照名。如果没有提供快照名，将显示此文件系统的所有快照。
-I
用于与远程目标进行通信的远程外壳。默认值是'ssh。

### 31.3.6. 修改快照属性

Lustre 快照目前有五个用户可见属性：快照名称、快照注释、创建时间、修改时间
和快照文件系统名称。其中，前两个属性可以修改。重命名遵循通用的 ZFS 快照名称规
则，如最大长度为 256 字节、不能与预留名称冲突等等。
要修改快照的属性，请在 MGS上运行以下1ct1命令：
1 lct1 snapshot modify ［-c | --comment comment］
2 <-F | --fsname fsname〉 ［-h | --help］ <-n | --name ssname〉
3 ［-N | --new new_ssname］ ［-r | --rsh remote_she11］

选项 说明
-c
-F
-h
-n
-N
更新快照注释
文件系统名
帮助信息
快照名
重新命名快照次 new_ssname
用于与远程目标进行通信的远程外壳。默认值是'ssh'。
-r

### 31.4. 全局写屏障

快照在多个 MDT 和OST上是非原子型的，这意味着如果创建快照时文件系统上存
在活动，则在 MDT 快照和 OST快照之间的时间间隔中创建或销毁的文件可能存在用户
可见的名称空间不一致问题。为保证文件系统快照的一致性，我们可以设置全局写屏障
或将系统"冻结”。完成该设置后，所有元数据修改在写屏障被主动移除（”解冻"）或过
期前都将被阻止。用户可以为该全局屏障设置超时参数，或明确地删除屏障。超时时间
默认力30秒。
请注意，即使没有设置全局屏障，快照仍可用。如果不使用屏障，当前客户端正在
修改的文件（写入、创建、取消链接）可能存在如上所述的不一致情况，其他未修改的
文件可以正常使用。
使用lct1
snapshot_create及-b选项请求创建快照，将在内部调用写屏障。因
此，使用快照时不需要明确使用屏障，但在创建快照之前请包含该选项。

### 31.4.1. 添加屏障

要添加全局写屏障，请在 MGS上运行1ct1 barrier_freeze命令：
1 lct1 barrier_freeze <fsname ［timeout （in seconds）］
2 where timeout default is 30.
将文件系统 testfs 冻结15秒：
1 mgs# lct1 barrier_freeze testfs 15
命令成功运行则无输出信息，否则将输出错误消息。

### 31.4.2. 移除屏障

移除全局写屏障，请在 MGS上运行lct1 barrier_thaw命令：

1 Lct1 barrier_thaw <fsname
为文件系统 tests解冻：
1 mgs# lct1 barrier_thaw testfs
命令成功运行则无输出信息，否则将输出错误消息。

### 31.4.3. 查询屏障


```bash
查看全局写障碍剩余时间，请在 MGS上运行lctl barrier_stat命令：
```
1 # Ict1 barrier_stat <fsname
查询文件系统 test/ 的写屏障统计信息：
1 mgs# lct1 barrier_stat testfs
2 The barrier for testfs is in 'frozen'
3 The barrier wi11 be expired after 7 seconds
命令成功运行则将输出如下表所示类别的统计信息，否则将输出错误消息。
写屏障可能存在的状态和相关含义如下表所示：
状态
含义
init
freezing_p1
freezing_p2
frozen
thawing
thawed
failed
expired
rescan
unknown
该系统上未曾设置屏障
设置写屏障的第一阶段
设置写屏障的第二阶段
已成功设置写屏障
写屏障"解冻"
写屏障已"解冻"
设置写屏障失败
写屏障超时
MDTs状态扫描，见barrier_rescan
其他情况
如果屏障处于'fteezing_Pl'、'freezing_P2'或frozen' 状态，将返回写屏障剩余的时间。


### 31.4.4. 重新扫描屏障

要重新扫描全局写屏障以检查哪些 MIDT 处于活动状态，请在 MGS上运行lct1
barrier_rescan命令：
1 lct1 barrier_rescan <fsname ［timeout （in seconds） ］，
2 where the default timeout is 31. seconds.
重新扫描文件系统 testfs 的写屏障：
1 mgs# lct1 barrier_rescan testfs
2 1 of 4 MDT（s） in the filesystem testfs are inactive
如果该命令成功，将输出总 MDT 数量及不可用的MDT 数量。否则，将输出错误
消息。

### 31.5. 快照日志

所有快照活动的日志可以在文件/var/1og/1snapshot.1og中找到。该文件包
含了快照创建和挂载、属性更改的时间信息，以及其他快照相关信息。
以下是 /var/log/1snapshot 文件的样本：
1 Mon Mar 21 19:43:06 2016
2 （15826:jt_snapshot_create:1138:scratch:ssh）：Create snapshot 1ss_0_0
3 successfully with comment <（nu11）>，barrier cenable,timeout <31.>
4 Mon Mar 21 19:43:11 2016（131.31.：jt_snapshot_create:1138:scratch:ssh）：
5 Create snapshot 1ss_0_1 successfully with corment <（nul1）>，barrier
6 <disable,timeout <-1>
7 Mon Mar 21 19:44:38 2016（17161:jt_snapshot_mount:2013:scratch:ssh）：
8 The snapshot 1ss 1a 0 is mounted
9 Mon Mar 21 19:44:46 2016
10 （17662:jt_snapshot_unount:2167:scratch:ssh）：the snapshot 1ss_1a_0
11 have been umounted
12 Mon Mar 21 19:47:12 2016
13 （20897:jt_snapshot_destroy: 1312:scratch:ssh）：Destroy snapshot
14 1ss_2_0 successfully with force <disable

### 31.6. Lustre 配置日志

快照独立于其原始文件系统，被视为可由 Lustre 客户端节点挂载的新文件系统名。
文件系统名是配置日志名的一部分，存在于配置日志条目中。有两个用于操作配置日志
的命令：1ct1 fork_1cfg和lct1 erase_lcfgo

